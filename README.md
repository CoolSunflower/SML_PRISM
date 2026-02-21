# Social Media Listening - Backend

Express.js backend that ingests social media mentions from multiple sources, classifies them using a two-stage ML pipeline (rule-based brand matching + SBERT/SVM relevancy model), and stores results in Azure Cosmos DB.

## Data Sources

| Source | Ingestion Method | Deduplication |
|--------|-----------------|---------------|
| **KWatch** | Webhook (push) — instant HTTP 200, async queue processing | Content-hash (`MD5(content)`) |
| **Google Alerts** | RSS polling (pull) — scrapes all feeds every 2 hours | URL-hash (`MD5(extractedUrl)`) |

## Architecture Overview

```
KWatch Webhook ──▶ In-Memory Queue ──▶ Batch Processor ──▶ Cosmos DB (KWatch Raw)
                                                        └──▶ Worker Pool
                                                                │
Google Alerts ──▶ RSS Scraper ──▶ Readability (full text) ──▶ Cosmos DB (Alerts Raw)
(203 RSS feeds)   (every 2 hrs)                             └──▶ Worker Pool
                                                                │
                                                    ┌───────────┘
                                                    ▼
                                              Brand Classifier (rule-based AST)
                                              Relevancy Classifier (SBERT + SVM ONNX)
                                                    │
                                                    ├──▶ Cosmos DB (KWatch Processed)
                                                    └──▶ Cosmos DB (Alerts Processed)
```

### Classification Pipeline

1. **Brand Classifier** — parses boolean query rules from `config/BrandQueries.csv` into ASTs at startup. Supports `AND`, `OR`, `NOT`, `NEAR/n`, quoted phrases, and language filtering (Portuguese via `franc`). If a rule matches, the item is tagged with its topic, sub-topic, and internal ID.
2. **Relevancy Classifier** — uses `Xenova/all-MiniLM-L6-v2` SBERT embeddings (384-dim) fed into an SVM RBF kernel exported as ONNX (`models/svm_classifier.onnx`). Acts as a fallback when no brand rule matches, and also annotates brand-matched items with a `relevantByModel` flag.
3. **Worker Pool** — spawns configurable child processes (default 2) that each load both classifiers. Jobs are distributed round-robin with automatic crash recovery and backpressure handling (max queue size 1000). Shared across all data sources.

## Features

- KWatch webhook ingestion with immediate HTTP 200 response and async processing
- Google Alerts RSS polling across all configured feeds in parallel batches (10 concurrent)
- Full article content extraction via `@mozilla/readability` (Firefox Reader View) with snippet fallback
- Per-feed state tracking so only new RSS entries are processed each cycle
- Domain blocklist (`config/alerts_not_websites.json`) with subdomain-aware filtering
- In-memory queue with configurable batch size (10) and interval (60 s) for KWatch
- Content-hash deduplication (KWatch) and URL-hash deduplication (Google Alerts)
- Multi-process classification worker pool (child processes, not threads, for ONNX compatibility)
- Paginated REST endpoints for raw and processed data from both sources
- Health endpoint exposing queue, worker pool, and scraper metrics
- Standalone classification API (`POST /api/classify`)
- Docker-ready with pre-downloaded HuggingFace models baked into the image
- Azure App Service deployment support via `web.config` (iisnode)

## Prerequisites

- **Node.js** ≥ 18
- **Azure Cosmos DB** account with the containers listed below
- (Optional) **Docker** for containerised deployment

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment** — create a `.env` file:
   ```env
   # Azure Cosmos DB
   COSMOS_ENDPOINT=https://<account>.documents.azure.com:443/
   COSMOS_KEY=<primary-key>

   # Shared database
   COSMOS_KWATCH_DATABASE=<database-name>

   # KWatch containers
   COSMOS_KWATCH_CONTAINER=<kwatch-raw-container>
   COSMOS_KWATCH_PROCESSED_CONTAINER=<kwatch-processed-container>

   # Google Alerts containers
   COSMOS_GOOGLE_ALERTS_RAW_CONTAINER=GoogleAlertsRawData
   COSMOS_GOOGLE_ALERTS_PROCESSED_CONTAINER=GoogleAlertsProcessedData
   COSMOS_GOOGLE_ALERTS_STATE_CONTAINER=GoogleAlertsState

   # Server
   PORT=3000

   # Workers (optional)
   CLASSIFICATION_WORKERS=2            # number of child processes
   MAX_CLASSIFICATION_QUEUE_SIZE=1000  # backpressure limit

   # Google Alerts (optional)
   GOOGLE_ALERTS_SCRAPE_INTERVAL=7200000  # ms, default 2 hours
   ```

3. **Configure RSS feeds** — edit `config/alerts_rss_feeds.json`:
   ```json
   {
     "Stryker": "https://www.google.com/alerts/feeds/<id>/...",
     "Stryker MAKO": "https://www.google.com/alerts/feeds/<id>/..."
   }
   ```
   Keys are the feed/keyword names used for classification sub-topics.

4. **(Optional) Configure blocked domains** — edit `config/alerts_not_websites.json`:
   ```json
   ["wikipedia.org", "stryker.com"]
   ```
   Entries support subdomain matching (`espn.com` also blocks `www.espn.com`).

5. **Start the server:**
   ```bash
   node server.js        # production
   npm run dev            # development (nodemon)
   ```

   On startup the server will:
   - Spawn classification workers and load brand queries + SBERT/ONNX models
   - Start the KWatch queue processor (60 s interval)
   - Start the Google Alerts RSS scraper (initial scrape immediately, then every 2 hours)

## API Endpoints

### Health & Status
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check with queue, worker pool, and scraper metrics |

### KWatch Webhook
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/webhook/kwatch` | Receive a KWatch notification (returns 200 immediately) |

**Required payload fields:** `platform`, `query`, `datetime`, `link`, `author`, `content`
**Optional fields:** `title`, `sentiment`

### KWatch Data
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/kwatch?page=1&limit=10` | Paginated raw KWatch data |
| `GET` | `/api/kwatch/processed?page=1&limit=10` | Paginated classified KWatch data |
| `DELETE` | `/api/kwatch/:id?platform=<partition>` | Delete a raw KWatch item |

### Google Alerts Data
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/google-alerts?page=1&limit=10` | Paginated raw Google Alerts articles |
| `GET` | `/api/google-alerts/processed?page=1&limit=10` | Paginated classified Google Alerts articles |
| `GET` | `/api/google-alerts/state` | Per-feed scrape state (last hash, timestamp, entry count) |
| `POST` | `/api/google-alerts/trigger` | Manually trigger a scrape cycle (409 if already running) |
| `DELETE` | `/api/google-alerts/:id` | Delete a raw Google Alerts item |

### Classification
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/classify` | Classify arbitrary text (accepts `{ text }` or `{ title, content }`) |
| `GET` | `/api/classify/status` | Worker pool status |

### PoC / Test
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/items?page=1&limit=10` | Paginated test items |
| `POST` | `/api/items` | Create a test item |

## Cosmos DB Containers

All containers live in the same database (`COSMOS_KWATCH_DATABASE`).

| Container | Partition Key | Description |
|-----------|--------------|-------------|
| `KWatchRawData` | `/platform`, `/id` (hierarchical) | Raw KWatch webhook payloads |
| `KWatchProcessedData` | `/platform`, `/id` (hierarchical) | Classified KWatch items |
| `GoogleAlertsRawData` | `/id` | Raw scraped articles with full content |
| `GoogleAlertsProcessedData` | `/id` | Classified Google Alerts articles |
| `GoogleAlertsState` | `/id` | Per-feed scrape state (topmost link hash) |

## Project Structure

```
server.js                             # Entry point — Express app, worker pool init, scrapers
config/
  database.js                         # Cosmos DB client & container singletons
  BrandQueries.csv                    # Brand query rules (boolean expressions)
  alerts_rss_feeds.json               # Google Alerts RSS feed URLs, keyed by feed name
  alerts_not_websites.json            # Domain blocklist for Google Alerts
models/
  svm_classifier.onnx                 # Pre-trained SVM relevancy model
  model_config.json                   # Model hyperparameters & thresholds
routes/
  index.js                            # Route aggregator
  webhook.js                          # POST /api/webhook/kwatch
  kwatch.js                           # GET/DELETE /api/kwatch
  googleAlerts.js                     # GET/POST/DELETE /api/google-alerts
  classify.js                         # POST /api/classify, GET /api/classify/status
  health.js                           # GET /api/health
  items.js                            # PoC CRUD for test items
services/
  kwatchQueue.js                      # In-memory queue, batch processor, dedup logic
  googleAlertsService.js              # RSS scraper, state management, content fetching
  classificationService.js            # Orchestrates brand + relevancy classification
  classificationWorkerPool.js         # Child-process pool with round-robin dispatch
  brandClassifier.js                  # CSV → AST parser, boolean query evaluator, lang detection
utils/
  parser.js                           # Tokenizer & AST engine (AND/OR/NOT/NEAR)
  relevancyClassifier.js              # SBERT embedding + ONNX SVM inference
workers/
  classificationWorkerProcess.js      # Child process entry point (IPC protocol)
scripts/
  download-models.js                  # Pre-download HuggingFace models for Docker
  Migration1/                         # Data migration scripts (fetch → classify → push)
  Migration2/                         # Second migration batch
public/
  index.html                          # Minimal frontend
test/                                 # Jest tests & integration scripts
```

## Testing

```bash
npm test                    # Run all tests
npm run test:workers        # Worker pool unit tests only
npm run test:integration    # KWatch integration tests (requires live Cosmos DB)
```

Tests for `googleAlertsService` fully mock all I/O (Cosmos DB, RSS parser, `fetch`, `jsdom`, `@mozilla/readability`) and cover:
- URL extraction from Google redirect links
- NOT websites domain matching (including subdomains)
- Feed scraping, state comparison, new-entry detection
- Queue processing: dedup, blocklist, content fetching, raw insert, classification
- Classification result handling
- Concurrent scrape guard (overlap prevention)
- All API routes

### Manual Webhook Test

```bash
curl -X POST http://localhost:3000/api/webhook/kwatch \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "twitter",
    "query": "Stryker Nailing",
    "datetime": "2026-01-21T10:55:24.397Z",
    "link": "https://example.com/post/1",
    "author": "test_user",
    "title": "Test Post",
    "content": "Stryker nail implant discussion",
    "sentiment": "positive"
  }'
```

### Manual Google Alerts Trigger

```bash
curl -X POST http://localhost:3000/api/google-alerts/trigger
```

## Docker

```bash
# Build (pre-downloads HuggingFace models into the image)
docker build --no-cache -t sml-backend:latest .

# Run
docker run -p 3000:3000 --env-file .env sml-backend:latest
```

The Dockerfile uses `node:20-bookworm`, installs native build tools for ONNX, and runs `scripts/download-models.js` at build time so the SBERT model is baked into the image.

## Data Migration Scripts

Located under `scripts/Migration1/` and `scripts/Migration2/`:

| Step | Script | Purpose |
|------|--------|---------|
| 1 | `1-fetch-raw-data.js` | Export raw data from Cosmos DB to local JSON |
| 2 | `2-test-classification.js` | Run classification on exported data locally |
| 3 | `3-push-to-database.js` | Push classified results back to Cosmos DB |

```bash
npm run migrate:fetch
npm run migrate:test
npm run migrate:push
```

## Deployment

The app is designed for **Azure App Service** (Linux or Windows via iisnode). A `web.config` is included for Windows/IIS deployments. For Linux App Service, deploy the Docker image or use zip deploy.

## License

MIT
