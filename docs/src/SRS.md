# Software Requirements Specification (SRS)

## PRISM: Platform for Real-time Insights & Social Monitoring

|||
|------------------|--------------------------|
| Document Version | 1.0                      |
| Status           | Draft                    |
| Date             | 2026-02-22               |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [Functional Requirements 1: Data Ingestion](#3-functional-requirements-1-data-ingestion)
4. [Functional Requirements 2: Classification](#4-functional-requirements-2-classification)
5. [Functional Requirements 3: Data Access & Monitoring](#5-functional-requirements-3-data-access--monitoring)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [External Interface Requirements](#7-external-interface-requirements)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the software requirements for backend of **PRISM (Platform for Real-time Insights & Social Monitoring)**, a system that ingests social media mentions and web articles from multiple sources, classifies them using a combination of rule-based and machine learning techniques, and stores the results for downstream consumption. The document serves as the authoritative reference for all functional and non-functional requirements, covering both currently implemented features and planned future enhancements.

### 1.2 Scope

PRISM is a server-side application designed to:

- Receive real-time social media mentions via webhook integrations (KWatch)
- Scrape and monitor web articles via Google Alerts RSS feeds
- Classify ingested content against a configurable set of brand queries using a rule-based boolean query engine
- Assess content relevancy using a trained machine learning model (SBERT + SVM)
- Store raw and classified data in Azure Cosmos DB for retrieval and analysis
- Expose REST APIs for data retrieval, on-demand classification, and system health monitoring
- Provide a lightweight dashboard for operational visibility
- Push data into SharePoint lists for downstream presentation

The system is scoped to the backend data pipeline ending at pushing data to presentation layer (SharePoint). Frontend analytics, dashboards, and end-user reporting tools are outside the scope of this document.

### 1.3 Definitions, Acronyms, and Abbreviations

| Term        | Definition |
|-------------|------------|
| PRISM       | Platform for Real-time Insights & Social Monitoring |
| KWatch      | Third-party social media monitoring service that delivers mentions (Facebook, Youtube, Reddit, Twitter/X) via webhooks |
| Google Alerts | Google's content monitoring service that provides RSS feeds for tracked keywords |
| AST         | Abstract Syntax Tree, an intermediate representation of parsed brand queries |
| SBERT       | Sentence-BERT, a transformer model for generating sentence-level text embeddings |
| SVM         | Support Vector Machine, a supervised learning model used for binary classification |
| ONNX        | Open Neural Network Exchange, a portable ML model format used for SVM inference |
| NEAR/n      | Proximity operator in the query language requiring two terms to appear within n tokens |
| Cosmos DB   | Azure Cosmos DB, Microsoft's globally distributed NoSQL database service |
| Readability | Mozilla's Readability library for extracting article content from web pages |
| IPC         | Inter-Process Communication, messaging protocol between parent and child processes |
| RBF         | Radial Basis Function, kernel function used in the SVM classifier |

### 1.4 References

| # | Reference | Description |
|---|-----------|-------------|
| 1 | Azure Cosmos DB Documentation | NoSQL database platform documentation |
| 2 | HuggingFace Transformers.js | JavaScript library for running transformer models |
| 3 | ONNX Runtime | Cross-platform ML inference engine |
| 4 | Mozilla Readability | Content extraction library |
| 5 | Microsoft Graph API | API for SharePoint and Microsoft 365 integration |
| 6 | Argos Translate | Open-source neural machine translation |

### 1.5 Document Overview

- **Section 2** provides a high-level product overview, including context, constraints, and assumptions.
- **Sections 3–5** detail the functional requirements organized by domain: data ingestion, classification, and data access/monitoring.
- **Section 6** specifies planned future features that are not yet implemented.
- **Section 7** covers non-functional requirements including performance, security, and deployment.
- **Section 8** describes external system interfaces.

---

## 2. Overall Description

### 2.1 Product Perspective

PRISM operates as a backend data pipeline within a broader social media monitoring ecosystem. It sits between upstream data sources (KWatch webhooks, Google Alerts RSS feeds) and downstream consumers (SharePoint lists, analytics dashboards, compliance teams).

The system is deployed as a standalone Node.js application on Azure App Service, backed by Azure Cosmos DB for persistence. It is designed for single-instance deployment with internal parallelism achieved through a child-process worker pool.

**System Context:**

```
┌─────────────────────────────────────────────────────┐
│                  External Sources                   │
│  ┌───────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │  KWatch   │  │ Google Alerts  │  │ Translation │ │
│  │ (Webhook) │  │  (RSS Feeds)   │  │  Service    │ │
│  └─────┬─────┘  └───────┬────────┘  └──────┬──────┘ │
└────────┼────────────────┼──────────────────┼────────┘
         │                │                  │
         ▼                ▼                  ▼
┌─────────────────────────────────────────────────────┐
│                    PRISM Backend                    │
│  Ingestion → Classification → Storage → Publishing  │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   ┌──────────┐  ┌──────────┐  ┌───────────┐
   │ Cosmos DB│  │SharePoint│  │ Dashboard │
   │ (Storage)│  │  Lists   │  │  (Read)   │
   └──────────┘  └──────────┘  └───────────┘
```

### 2.2 Product Functions

At a high level, PRISM provides the following capabilities:

1. **Multi-Source Data Ingestion** - Receives social media mentions via KWatch webhooks and scrapes web articles via Google Alerts RSS feeds on a scheduled basis.
2. **Content Enrichment** - Extracts full article text from web pages using Mozilla Readability, cleans and normalizes content for classification.
3. **Deduplication** - Detects and handles duplicate content across both data sources using content-hash and URL-hash strategies.
4. **Brand Classification** - Evaluates ingested content against 400+ configurable boolean queries to identify brand mentions, competitor activity, and topic categorization.
5. **Relevancy Classification** - Uses a trained SBERT+SVM model to assess whether content is relevant to the monitoring domain, serving as a fallback when no brand query matches.
6. **Parallel Processing** - Distributes classification workload across a child-process worker pool for throughput and isolation.
7. **Data Persistence** - Stores both raw and classified data in Azure Cosmos DB with separate containers for each source and processing stage.
8. **REST API** - Exposes endpoints for data retrieval, on-demand classification, manual scrape triggers, and system health checks.
9. **Operational Dashboard** - Provides a lightweight web interface for viewing ingested data, classification results, and queue status.

### 2.3 User Characteristics

| User Role | Description |
|-----------|-------------|
| Data Analyst | Consumes classified data from Cosmos DB or SharePoint lists for reporting and analysis |
| System Operator | Monitors system health; Maintains brand query rules (BrandQueries.csv), RSS feed lists, and blocklist configurations; trains/updates ML models |

### 2.4 Constraints (Development & Deployment)

| Constraint | Description |
|------------|-------------|
| C-01 | The system must run on Azure App Service (Linux or Windows via IIS) |
| C-02 | Azure Cosmos DB is the sole persistence layer (NoSQL document store) |
| C-03 | ONNX Runtime requires native bindings, preventing the use of Node.js Worker Threads (child processes must be used instead) |
| C-04 | Google Alerts RSS feeds are rate-limited and may return stale data; the system must handle incremental scraping |
| C-05 | Brand query rules are maintained externally in CSV format and loaded at startup |
| C-06 | The SBERT embedding model (all-MiniLM-L6-v2) must be pre-downloaded during Docker build to avoid runtime latency |

### 2.5 Assumptions and Dependencies

| ID | Assumption / Dependency |
|----|------------------------|
| A-01 | KWatch will deliver webhook payloads in the expected JSON format with required fields (platform, query, datetime, link, author, content) |
| A-02 | Google Alerts RSS feeds remain accessible at their configured URLs and follow standard RSS 2.0/Atom format |
| A-03 | Azure Cosmos DB provides sufficient throughput (RU/s) for the expected ingestion and query volume |
| A-04 | The SBERT model and SVM ONNX model are pre-trained and provided as static artifacts; retraining is outside runtime scope |
| A-05 | Network connectivity to external article URLs is available for Readability-based content extraction |
| A-06 | The Translation Service (future) will be deployed as a separate Azure App Service accessible via HTTP |
| A-07 | SharePoint Online (future) will be accessible via Microsoft Graph API with appropriate app registration credentials |

---

## 3. Functional Requirements 1: Data Ingestion

### 3.1 FR-ING-01: KWatch Webhook Reception (Status: Implemented)

**Description:** The system shall expose an HTTP POST endpoint (`/api/webhook/kwatch`) that receives social media mention payloads from KWatch. Upon receiving a valid payload, the system shall immediately return an HTTP 200 response and schedule asynchronous processing to avoid blocking the webhook caller.

**Required Payload Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| platform | String | Yes | Source platform identifier (e.g., "twitter", "reddit", "linkedin") |
| query | String | Yes | The search query or keyword that triggered the mention (e.g. "Keyword: stryker") |
| datetime | String (ISO 8601) | Yes | Publication timestamp of the original post |
| link | String (URL) | Yes | Direct URL to the source post |
| author | String | Yes | Author or account name of the post |
| content | String | Yes | Full text body of the post |
| title | String | No | Post title or headline (defaults to empty string) |
| sentiment | String | No | Pre-classified sentiment value (defaults to "neutral") |

**Acceptance Criteria:**
- The endpoint shall return HTTP 400 if any required field is missing.
- The endpoint shall return HTTP 200 and enqueue the item for processing without waiting for classification to complete.
- The system shall append a server-side `receivedAt` timestamp (ISO 8601) to each received document.

---

### 3.2 FR-ING-02: KWatch Queue Processing (Status: Implemented)

**Description:** The system shall maintain an in-memory queue for received KWatch items and process them in batches at a fixed interval. This decouples ingestion rate from processing throughput and allows burst absorption.

**Batch Parameters:**

| Parameter | Value | Configurable |
|-----------|-------|-------------|
| Batch Size | 10 items | No (hardcoded) |
| Batch Interval | 60 seconds | No (hardcoded) |
| Max Queue Size | 1000 items | Yes (`MAX_CLASSIFICATION_QUEUE_SIZE` env var) |

**Processing Flow per Batch:**
1. Dequeue up to 10 items from the in-memory queue.
2. Attempt to insert each item as a raw document into Cosmos DB (KWatchRawData container).
3. For each successfully inserted or duplicate-recovered item, submit a classification job to the worker pool.
4. Log batch results (insertions, failures, duplicates, jobs submitted).

**Acceptance Criteria:**
- The queue shall not process a new batch while the previous batch is still in progress (mutual exclusion).
- If the queue exceeds the maximum size, new items shall be rejected with appropriate logging (Address this by updating queue size, increasing classification workers, or upgrading app service plan).

---

### 3.3 FR-ING-03: KWatch Deduplication (Status: Implemented)

**Description:** The system shall detect duplicate KWatch items using content-based hashing and implement a recovery strategy that preserves all received items while marking duplicates.

**Deduplication Strategy:**
1. **Primary ID Generation:** Each item's document ID is computed as `MD5(content)`. Items with identical content will produce the same ID.
2. **Conflict Detection:** When a Cosmos DB insert returns HTTP 409 (Conflict), the item is identified as a duplicate.
3. **Duplicate Recovery:** A new unique ID is generated using `MD5(platform + datetime + author + timestamp)` and the document is re-inserted with:
   - A new unique document ID
   - The `isDuplicate` flag set to `true`
4. **Classification Continuity:** Both original and duplicate-recovered items proceed through classification.

**Acceptance Criteria:**
- Duplicate items shall be stored with `isDuplicate: true` and a unique regenerated ID.
- The original content hash remains traceable for audit purposes.
- No data shall be silently dropped due to duplication.

---

### 3.4 FR-ING-04: Google Alerts RSS Feed Scraping (Status: Implemented)

**Description:** The system shall periodically scrape a configured set of Google Alerts RSS feeds to discover new web articles matching monitored keywords. The scraper runs on a fixed schedule and processes all configured feeds in parallel batches.

**Scraper Parameters:**

| Parameter | Value | Configurable |
|-----------|-------|-------------|
| Scrape Interval | 2 hours (7,200,000 ms) | Yes (`GOOGLE_ALERTS_SCRAPE_INTERVAL` env var) |
| Feed Concurrency | 10 feeds per batch | No (hardcoded) |
| RSS Fetch Timeout | 15 seconds | No (hardcoded) |
| Feed Count | 202 feeds | Yes (via `alerts_rss_feeds.json` config) |

**Scraping Flow per Cycle:**
1. Load all feed state documents from Cosmos DB (GoogleAlertsState container).
2. For each configured feed from alerts config json (processed in parallel batches of 10):
   - Fetch and parse the RSS feed.
   - Compare the topmost entry's link hash against the stored `lastLinkHash` from state.
   - If unchanged, skip the feed (no new entries).
   - If new entries exist, extract only entries newer than the known hash.
   - Clean HTML tags and decode entities from titles and content snippets.
   - Save the new topmost link hash to the state container for the next cycle.
3. Collect all new entries into a processing queue and proceed to content extraction and classification.

**Acceptance Criteria:**
- The scraper shall not start a new cycle while a previous cycle is still running (mutual exclusion).
- Feeds that fail to parse shall be logged and skipped without affecting other feeds.
- The scraper shall start automatically at server startup and can also be triggered manually via API.

---

### 3.5 FR-ING-05: Google Alerts URL Extraction & Validation (Status: Implemented)

**Description:** Google Alerts RSS entries contain redirect URLs (format: `https://www.google.com/url?rct=j&sa=t&url=<actual_url>&ct=ga`). The system shall extract the actual article URL from the `url` query parameter of the Google redirect link.

**Acceptance Criteria:**
- The system shall parse the `url` query parameter from the Google redirect URL.
- If URL extraction fails (malformed link or missing parameter), the entry shall be skipped with a warning log.
- The extracted URL shall be validated as a well-formed URL before further processing.

---

### 3.6 FR-ING-06: Full-Text Article Extraction (Readability) (Status: Implemented)

**Description:** For each Google Alerts entry with a valid extracted URL, the system shall attempt to fetch the full article page and extract its text content using Mozilla's Readability library. This provides richer content for classification than the RSS snippet alone.

**Extraction Parameters:**

| Parameter | Value |
|-----------|-------|
| Fetch Timeout | 10 seconds |
| Minimum Content Length | 100 characters |
| Content Type Requirement | `text/html` |
| User-Agent | Standard browser User-Agent string |

**Extraction Flow:**
1. Fetch the article page with a 10-second timeout and browser-like headers.
2. Verify the response is HTTP 2xx and content type includes `text/html`.
3. Parse the HTML with JSDOM and run Readability to extract the article body.
4. Collapse whitespace and trim the result.
5. If the extracted text is 100+ characters, use it as `fullContent`; otherwise discard it.

**Content Source Selection:**
- If `fullContent` is successfully extracted: `contentSource = 'full'`, `content = fullContent`
- If extraction fails or yields insufficient text: `contentSource = 'snippet'`, `content = contentSnippet`

**Acceptance Criteria:**
- Fetch failures (timeouts, non-HTML responses, parse errors) shall be handled gracefully without stopping the pipeline.
- The `contentSource` field shall accurately reflect which source was used for classification.

---

### 3.7 FR-ING-07: Website Blocklist Filtering (Status: Implemented)

**Description:** The system shall maintain a configurable blocklist of website domains. Articles from blocked domains shall be excluded from processing to prevent noise (e.g., the company's own website, Wikipedia).

**Current Blocklist:** `stryker.com`, `wikipedia.org`

**Matching Rules:**
- Exact domain match (e.g., `stryker.com` blocks `stryker.com`)
- Subdomain match (e.g., `stryker.com` also blocks `www.stryker.com`, `blog.stryker.com`)

**Acceptance Criteria:**
- Blocked articles shall be logged and counted but not inserted into raw or processed containers.
- The blocklist shall be configurable via the `alerts_not_websites.json` configuration file without code changes.

---

### 3.8 FR-ING-08: Google Alerts Deduplication (Status: Implemented)

**Description:** The system shall detect duplicate Google Alerts articles using URL-based hashing to prevent re-processing articles that appear across multiple feeds or scraping cycles.

**Deduplication Strategy:**
1. **ID Generation:** Document ID is computed as `MD5(extractedUrl)`.
2. **Point Read Check:** Before inserting a raw document, the system performs a Cosmos DB point read by this ID.
3. **If Found:** The article is skipped as a duplicate (counted in metrics).
4. **If Not Found (404):** The article proceeds to insertion and classification.
5. **Race Condition Handling:** If a concurrent insert causes a 409 Conflict during the create operation, the item is treated as a duplicate and skipped.

**Acceptance Criteria:**
- Duplicate articles shall not be re-inserted or re-classified.
- The dedup check shall use Cosmos DB point reads (1 RU cost) for efficiency.

---

### 3.9 FR-ING-09: Google Alerts Feed State Management (Status: Implemented)

**Description:** The system shall track the scraping state of each Google Alerts RSS feed to enable incremental scraping, only processing entries that are newer than the last known entry.

**State Document Fields:**

| Field | Description |
|-------|-------------|
| id | MD5 hash of the feed name (partition key) |
| feedName | Human-readable name of the Google Alerts feed |
| feedUrl | RSS feed URL |
| lastLinkHash | MD5 hash of the topmost (newest) entry's link from the last successful scrape |
| lastScrapedAt | ISO 8601 timestamp of the last scrape |
| entryCount | Total number of entries in the feed at last scrape |

**Incremental Logic:**
1. On each scrape cycle, compare the current topmost entry's link hash with the stored `lastLinkHash`.
2. If they match, the feed has no new entries, so skip it.
3. If they differ, walk entries from newest to oldest, collecting entries until the known hash is encountered.
4. After processing, upsert the state document with the new topmost hash.

**Acceptance Criteria:**
- State shall be persisted in the GoogleAlertsState container and survive server restarts.
- A feed scraped for the first time (no existing state) shall process all current entries.
- Empty feeds shall have their state saved with `lastLinkHash: null` and `entryCount: 0`.

---

### 3.10 FR-ING-10: Multilingual Translation Support (Status: Planned)

**Description:** The system shall support translation of non-English content into English for classification and analysis. A separate Translation Service will be deployed as an independent Azure App Service, running Argos Translate models for 23 supported languages.

**Translation Service Architecture:**
- **High-Frequency Models (7):** Always loaded in memory for instant translation (languages selected based on volume analysis).
- **Conditional Model Slots (3):** Dynamically loaded on demand for the remaining 16 languages. When a request arrives for an unloaded language, the least-recently-used slot is evicted and the requested model is loaded.
- **Cold Start Handling (WIP):** The architecture for handling cold start latency during model loading is under evaluation. Options under consideration include:
  - Always-on warm pool with all high-frequency models pre-loaded
  - Queue-based async translation with retry and eventual consistency
  - Health-check gating where translation requests wait until the model is ready
  - Lazy initialization with request-level timeout and fallback to untranslated text

**Integration with PRISM Pipeline:**
1. For every ingested item (KWatch or Google Alerts), detect the language of the content.
2. If the content is not in English and the detected language is one of the 23 supported languages, send a translation request to the Translation Service.
3. Store the English translation as an additional field (`translatedContent`) in both raw and processed documents.
4. Run the classification pipeline on **both** the original text and the English translation separately.
5. Use the original language classification for topic/brand matching (existing multilingual queries) and the English translation for relevancy model assessment.

**Acceptance Criteria:**
- Non-English items that cannot be translated (unsupported language or service unavailable) shall proceed through the pipeline using their original text only.
- Translation latency shall not block the ingestion pipeline; if the Translation Service is unavailable, items shall be processed without translation.
- The `translatedContent` field shall be null for English-language content and for items where translation failed or was unavailable.

---

## 4. Functional Requirements 2: Classification

### 4.1 FR-CLS-01: Brand Classification (Rule-Based AST) (Status: Implemented)

**Description:** The system shall evaluate ingested content against a library of brand query rules to identify brand mentions, competitor activity, and topic categorizations. Each rule is a boolean expression written in a custom query language, parsed at startup into an Abstract Syntax Tree (AST), and evaluated against the normalized text of each item.

**Rule Source:** Brand query rules are defined in a CSV file (`BrandQueries.csv`) with the following columns:

| Column | Description |
|--------|-------------|
| Topic | Primary classification category (e.g., "Ankle Joint", "Competitors", "External Fixation") |
| Sub topic | Secondary classification category (e.g., "GRAVITY Synchfix", "Depuy-Synthes", "Hoffmann") |
| Query name | Language identifier for the rule |
| Internal ID | UUID for internal tracking and traceability |
| Query | Boolean expression in the custom query language |

**Rule Count:** 400+ rules loaded and compiled at startup.

**Evaluation Process:**
1. Text is normalized: lowercased, diacritics decomposed (NFD), punctuation replaced with spaces, only alphanumerics and @/# preserved.
2. The normalized text is tokenized into an array of terms.
3. Each query's AST is evaluated against the token array.
4. The first matching query determines the classification (topic, sub-topic, query name, internal ID).
5. If no query matches, the item falls through to the relevancy classifier.

**Acceptance Criteria:**
- All well-formed queries in the CSV shall be parsed into ASTs at startup; malformed queries shall be logged and skipped.
- Matching shall be case-insensitive and diacritics-insensitive.
- The first matching rule wins (order-dependent evaluation).

---

### 4.2 FR-CLS-02: Query Language Operators (Status: Implemented)

**Description:** The brand query language shall support the following operators for expressing complex matching conditions:

| Operator | Syntax | Description |
|----------|--------|-------------|
| AND | `term1 AND term2` | Both terms must be present in the text |
| OR | `term1 OR term2` | At least one of the terms must be present |
| NOT | `NOT term` | The term must not be present in the text; if a NOT clause matches, the entire rule is rejected |
| NEAR/n | `term1 NEAR/n term2` | Both terms must be present and appear within n tokens of each other |
| Quoted Phrase | `"exact phrase"` | The exact multi-word sequence must appear in the text |
| Wildcard | `term*` | Matches any token that starts with the given prefix |
| Parentheses | `(expr)` | Groups sub-expressions for precedence control |
| Mentions | `@username` | Matches @-prefixed tokens (social media mentions) |
| Hashtags | `#hashtag` | Matches #-prefixed tokens (social media hashtags) |

**Operator Precedence:** NOT > AND > OR (parentheses override precedence).

**Evaluation Order:**
1. NOT clauses are checked first - if any NOT clause matches, the entire rule immediately fails.
2. Positive clauses (AND, OR, NEAR, terms) are then evaluated.
3. A rule with only NOT clauses (no positive terms) matches if none of the NOT terms are found.

**Acceptance Criteria:**
- All operators listed above shall be supported and correctly parsed.
- Nested expressions with mixed operators and parentheses shall evaluate correctly.
- NEAR/n shall count token distance accurately.

**Updated Acceptance Critera:**
- Based on historical data testing, the NEAR/n operator has been reduced to AND operator (equivalent to NEAR/inf).

---

### 4.3 FR-CLS-03: Relevancy Classification (SBERT + SVM) (Status: Implemented)

**Description:** The system shall use a trained machine learning pipeline to assess whether content is relevant to the monitoring domain. The pipeline consists of a Sentence-BERT embedding model followed by a Support Vector Machine (SVM) classifier.

**Model Specifications:**

| Component | Specification |
|-----------|--------------|
| Embedding Model | Xenova/all-MiniLM-L6-v2 (Sentence-BERT) |
| Embedding Dimension | 384 |
| Classifier | SVM with RBF kernel (ONNX format) |
| Output Classes | "Not Related" (0), "Mention" (1) |
| Default Threshold | 0.40 (probability >= threshold → relevant) |
| Stryker-specific Threshold | 0.55 (applied when text contains "stryker") |

**Model Performance Metrics:**

| Metric | Value |
|--------|-------|
| AUC-ROC | 0.9686 |
| Recall at Threshold | 0.99 |
| Precision at Threshold | 0.904 |

**Dual Threshold Logic:**
- If the input text contains the word "stryker" (case-insensitive), the higher threshold (0.55) is applied to reduce false positives from general mentions of the brand name.
- For all other text, the standard threshold (0.40) is used to maximize recall.

**Acceptance Criteria:**
- The model shall be loaded at worker process startup and remain in memory for the lifetime of the process.
- The embedding model shall be pre-downloaded at Docker build time to avoid first-request latency.
- If the relevancy classifier fails to initialize, the system shall continue operating with brand classification only.

---

### 4.4 FR-CLS-04: Classification Orchestration & Fallback Logic (Status: Implemented)

**Description:** The system shall orchestrate a two-stage classification pipeline that first attempts brand classification, then falls back to relevancy classification, with the following decision logic:

**Decision Flow:**

1. **Prepare Text:** Concatenate `title` and `content` fields, trim whitespace. If empty, return no match.

2. **Stage 1 - Brand Classification:**
   - Evaluate the text against all brand query rules.
   - If a brand rule matches:
     - Record the topic, sub-topic, query name, and internal ID.
     - Additionally run the relevancy classifier to annotate the `relevantByModel` flag (informational only; the brand match is authoritative).
     - Return classification with method `BrandQuery`.

3. **Stage 2 - Relevancy Fallback (only if Stage 1 did not match):**
   - Run the relevancy classifier on the text.
   - If relevant (probability >= threshold):
     - Assign a synthetic classification:
       - topic: `General-RelevancyClassification`
       - subTopic: Extracted from the item's `query` field (text before first period)
       - queryName: `RelevancyClassification`
       - internalId: `74747474747474747474747474747474` (fixed placeholder)
     - Return classification with method `RelevancyClassification`.
   - If not relevant: Return no match (item is not stored in the processed container).

**Classification Output Structure:**

| Field | Type | Description |
|-------|------|-------------|
| matched | Boolean | Whether any classifier matched |
| method | String or null | `'BrandQuery'`, `'RelevancyClassification'`, or `null` |
| classification.topic | String | Primary classification category |
| classification.subTopic | String | Secondary classification category |
| classification.queryName | String | Name of the matching rule |
| classification.internalId | String | UUID of the matching rule |
| relevantByModel | Boolean | Whether the relevancy ML model considers this item relevant |

**Acceptance Criteria:**
- Items that match neither brand rules nor the relevancy model shall not be stored in processed containers.
- The `relevantByModel` flag shall always reflect the ML model's assessment, regardless of which stage was authoritative.
- Brand classification takes priority over relevancy classification when both could match.

---

### 4.5 FR-CLS-05: Worker Pool Management (Status: Implemented)

**Description:** The system shall distribute classification workload across a pool of child processes to achieve parallelism and isolation. Child processes (not worker threads) are used because the ONNX Runtime native bindings are incompatible with Node.js Worker Threads.

**Worker Pool Parameters:**

| Parameter | Default | Configurable |
|-----------|---------|-------------|
| Worker Count | 2 | Yes (`CLASSIFICATION_WORKERS` env var) |
| Max Queue Size | 1000 | Yes (`MAX_CLASSIFICATION_QUEUE_SIZE` env var) |
| Init Timeout | 120 seconds | No (hardcoded) |

**Worker Pool Behavior:**
1. **Initialization:** The pool forks N child processes at startup. Each worker loads the brand classifier and relevancy classifier. Workers signal readiness via IPC message `{ type: 'ready' }`.
2. **Job Distribution:** Jobs are distributed via round-robin across available (non-busy) workers.
3. **IPC Protocol:** Jobs are sent as `{ type: 'classify', jobId, data }`. Results are returned as `{ type: 'result', jobId, success, result, error }`.
4. **Crash Recovery:** If a worker exits with a non-zero code, it is automatically respawned and re-initialized.
5. **Backpressure:** If the internal job queue exceeds the max size, new submissions are rejected with a null return.
6. **Graceful Shutdown:** On SIGTERM/SIGINT, all workers are terminated and pending jobs are abandoned.

**Metrics Tracked:**

| Metric | Description |
|--------|-------------|
| jobsSubmitted | Total jobs submitted to the pool |
| jobsCompleted | Total jobs completed successfully |
| jobsFailed | Total jobs that returned errors |
| workerCrashes | Total worker restarts due to crashes |
| processingTimes | Rolling window of last 1000 job durations (for averaging) |
| queueDepth | Current number of pending jobs |

**Acceptance Criteria:**
- All workers shall be ready before the system begins accepting webhook data (120s timeout).
- A crashed worker shall be automatically replaced without manual intervention.
- Job submissions shall return immediately (non-blocking); results are delivered via callback.

---

### 4.6 FR-CLS-06: Portuguese Language Detection Override (Status: Implemented)

**Description:** Certain brand queries are written in French for French-language content (e.g., "Fixos" product line). When evaluating such queries, Portuguese-language content can produce false positive matches due to lexical similarity between French and Portuguese. The system shall detect Portuguese-language text using the `franc` library and skip the match for affected queries.

**Acceptance Criteria:**
- Portuguese language detection shall be applied only to queries that are flagged as susceptible (currently: Fixos-related French queries).
- If Portuguese is detected, the current brand rule match is skipped and evaluation continues to the next rule.
- The detection does not prevent the item from being classified by other rules or the relevancy fallback.
- This false positive system should remain extendible incase new mismatches are identified in the future.

---

### 4.7 FR-CLS-07: Relevancy NOT Words Filter (Status: Planned)

**Description:** For items that are classified as relevant by the relevancy ML model (i.e., items that went through the relevancy fallback path), the system shall apply an additional filtering step using a configurable list of exclusion words. If any exclusion word for the corresponding keyword/feed is found in the item's text, the item shall be excluded from processed output.

**Purpose:** The relevancy ML model may produce false positives for certain keywords. For example, if the original keyword is "Stryker," the model might flag content about "Stryker" football players or the comic book character. NOT words like "football," "comics," etc., filter out these false positives.

**Configuration:**
- A JSON or CSV configuration file mapping each keyword/feed name to a set of exclusion words.
- Example:
  ```json
  {
    "Stryker": ["football", "comics", "marvel", "movie", "nfl"],
    "Gamma3": ["radiation", "gamma ray", "hulk"]
  }
  ```

**Filter Logic:**
1. After the relevancy model classifies an item as relevant (method = `RelevancyClassification`):
2. Look up the item's `query` or `feedName` in the NOT words configuration.
3. If any configured NOT word is found in the item's text (case-insensitive match):
   - Mark the item as not relevant.
   - Do not store it in the processed container.
4. If no NOT word matches, proceed normally.

**Acceptance Criteria:**
- The filter shall only apply to items classified via the `RelevancyClassification` method, not to `BrandQuery` matches.
- The NOT words configuration shall be loadable at startup from a config file without code changes.
- Matching shall be case-insensitive.

---

## 5. Functional Requirements 3: Data Access & Monitoring

### 5.1 FR-API-01: KWatch Data Retrieval API (Status: Implemented)

**Description:** The system shall expose REST endpoints for retrieving raw and processed KWatch data with pagination support.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/kwatch` | Retrieve paginated raw KWatch items |
| GET | `/api/kwatch/processed` | Retrieve paginated processed KWatch items |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | Integer | 1 | Page number (1-indexed) |
| limit | Integer | 10 | Items per page |

**Response Structure:**
```json
{
  "items": [ /* array of documents */ ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalItems": 150,
    "totalPages": 15
  },
  "queueStatus": {
    "pending": 3,
    "processing": false
  }
}
```

**Acceptance Criteria:**
- Both endpoints shall support pagination via `page` and `limit` query parameters.
- The response shall include the current queue status (pending count and processing flag).
- Items shall be ordered by Cosmos DB default ordering (insertion order).

---

### 5.2 FR-API-02: Google Alerts Data Retrieval API (Status: Implemented)

**Description:** The system shall expose REST endpoints for retrieving raw and processed Google Alerts data, feed state information, and manual scrape control.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/google-alerts` | Retrieve paginated raw Google Alerts articles |
| GET | `/api/google-alerts/processed` | Retrieve paginated processed Google Alerts articles |
| GET | `/api/google-alerts/state` | Retrieve all feed state documents and scraper status |
| POST | `/api/google-alerts/trigger` | Manually trigger a scrape cycle |

**State Response Structure:**
```json
{
  "feeds": [ /* array of feed state documents */ ],
  "scraperStatus": {
    "isRunning": false,
    "lastScrapeAt": "2026-02-22T10:00:00.000Z",
    "lastScrapeStats": { /* cycle metrics */ },
    "nextScrapeInMs": 3600000,
    "totalFeeds": 50,
    "blockedWebsites": ["stryker.com", "wikipedia.org"]
  }
}
```

**Acceptance Criteria:**
- Data retrieval endpoints shall support the same pagination as KWatch APIs.
- The state endpoint shall include both per-feed state and aggregate scraper status.
- The trigger endpoint shall start an async scrape and return immediately with confirmation.

---

### 5.3 FR-API-03: On-Demand Classification API (Status: Implemented)

**Description:** The system shall expose an API endpoint for classifying arbitrary text on demand, independent of the ingestion pipeline. This enables testing and ad-hoc analysis.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/classify` | Classify arbitrary text |
| GET | `/api/classify/status` | Get worker pool status |

**Request Body (Classify):**
```json
{
  "text": "optional - used if provided",
  "title": "optional - concatenated with content",
  "content": "optional - primary text for classification"
}
```

**Response (Classify):**
```json
{
  "matched": true,
  "method": "BrandQuery",
  "classification": {
    "topic": "Ankle Joint",
    "subTopic": "GRAVITY Synchfix",
    "queryName": "Gravity Synchfix",
    "internalId": "abc-def-123"
  },
  "relevantByModel": true,
  "textLength": 245
}
```

**Response (Status):**
```json
{
  "initialized": true,
  "workerCount": 2,
  "workers": [
    { "id": 0, "ready": true, "busy": false },
    { "id": 1, "ready": true, "busy": false }
  ]
}
```

**Acceptance Criteria:**
- At least one of `text`, `title`, or `content` must be provided; otherwise return HTTP 400.
- The endpoint shall use the same classification pipeline as the ingestion flow.

---

### 5.4 FR-API-04: Health & Monitoring API (Status: Implemented)

**Description:** The system shall expose a health check endpoint that reports the operational status of all subsystems along with key performance metrics.

**Endpoint:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | System health and metrics |

**Response Fields:**

| Field | Description |
|-------|-------------|
| status | Overall system status ("healthy") |
| uptime | Server uptime in seconds |
| workerPool.initialized | Whether the worker pool is ready |
| workerPool.workerCount | Number of active workers |
| workerPool.metrics | Job counts, crash counts, avg processing time, queue depth |
| kwatchQueue.pending | Number of items waiting in the KWatch queue |
| kwatchQueue.processing | Whether a batch is currently being processed |
| googleAlerts.isRunning | Whether a scrape cycle is in progress |
| googleAlerts.lastScrapeAt | Timestamp of last completed scrape |
| googleAlerts.totalFeeds | Number of configured RSS feeds |

**Acceptance Criteria:**
- The endpoint shall always return HTTP 200 (even if subsystems are degraded) with accurate status information.
- Response time shall be under 100ms (no database queries required).

---

### 5.5 FR-API-05: Dashboard (Status: Implemented)

**Description:** The system shall serve a single-page web dashboard for operational visibility. The dashboard provides a read-only view of ingested data, classification results, and system status.

**Dashboard Features:**

| Feature | Description |
|---------|-------------|
| Data Views | Toggle between KWatch Raw and KWatch Processed views (keyboard shortcut: Ctrl+K) |
| Pagination | Navigate through items with 10 items per page |
| Statistics | Display total item count, current page, and last updated timestamp |
| Queue Status | Show pending items and processing state |
| Platform Indicators | Display platform-specific identifiers for each item (Reddit, Twitter, LinkedIn, etc.) |
| Sentiment Display | Show sentiment classification for processed items |
| Source Links | Direct links to original source articles |
| Classification Details | Display topic, sub-topic, and matching query for classified items |
| Auto-Refresh | Automatically refresh data every 2 minutes |
| Dark Theme | Dark-themed responsive design suitable for monitoring screens |

**Acceptance Criteria:**
- The dashboard shall be served as static files from the `/public` directory.
- All data shall be fetched from the existing REST APIs (no direct database access).
- The UI shall be responsive and functional on both desktop and mobile browsers.

---

### 5.6 FR-API-06: Adverse Event Notification System (Status: Planned)

**Description:** The system shall send automated email notifications when a classified item's topic indicates a death-related adverse event involving competitor products. Specifically, if the brand classification assigns the topic "Competitors" with a sub-topic indicating death-related events (e.g., "Death Related Event Notification"), an email alert shall be triggered to designated recipients.

**Trigger Condition:**
- Classification topic: Death-related events involving competitors (exact topic/sub-topic names to be finalized).

**Notification Content:**
- Source platform and link to original post
- Classification details (topic, sub-topic, query name)
- Content snippet or summary
- Timestamp of the original post

**Architecture:** To be determined. Email delivery mechanism (SMTP, Azure Communication Services, SendGrid, etc.) and recipient management are under evaluation.

**Acceptance Criteria:**
- Notifications shall be sent in near-real-time after classification (within minutes, not hours).
- Duplicate notifications for the same item shall be prevented.
- Notification failures shall be logged but shall not block the classification pipeline.

---

### 5.7 FR-API-07: SharePoint List Publishing (Status: Planned)

**Description:** The system shall publish every successfully processed document (from both KWatch and Google Alerts) to a SharePoint Online list using the Microsoft Graph API. An Azure AD app registration will provide the necessary credentials.

**Unified Document Schema:**

The following fields shall be mapped from processed KWatch and Google Alerts documents into a single unified structure for the SharePoint list:

| Field | Type | Source (KWatch) | Source (Google Alerts) | Description |
|-------|------|-----------------|----------------------|-------------|
| id | String | item.id | item.id | Unique document identifier |
| platform | String | item.platform | `'google-alerts'` | Source platform |
| query | String | item.query | item.feedName | Keyword or feed name that triggered the item |
| datetime | String (ISO 8601) | item.datetime | item.publishedAt | Original publication timestamp |
| link | String (URL) | item.link | item.extractedUrl | URL to the original content |
| author | String | item.author | `'N/A'` | Author of the content (not available for Google Alerts) |
| title | String | item.title | item.title | Title of the content |
| content | String | item.content | item.content | Full text body (or snippet) |
| sentiment | String | item.sentiment | `'neutral'` | Sentiment classification |
| topic | String | item.topic | item.topic | Primary classification category |
| subtopic | String | item.subTopic | item.subTopic | Secondary classification category |
| relevantByModel | Boolean | item.relevantByModel | item.relevantByModel | Whether the ML model considers this relevant |
| isDuplicate | Boolean | item.isDuplicate | `false` | Whether this was a duplicate item |

**Processed Container Additions:**

Two new fields shall be added to existing processed containers (KWatchProcessedData and GoogleAlertsProcessedData):

| Field | Type | Description |
|-------|------|-------------|
| publishedToSharePoint | Boolean | Whether the item was successfully published to the SharePoint list |
| publishedAt | String (ISO 8601) or null | Timestamp of successful publication; null if not yet published |

**Publishing Flow:**
1. After a document is successfully classified and stored in the processed container, initiate a SharePoint publish request.
2. Map the processed document fields to the unified schema.
3. Call the Microsoft Graph API to create a new list item in the configured SharePoint list.
4. On success: Update the processed document with `publishedToSharePoint: true` and `publishedAt: <timestamp>`.
5. On failure: Log the error; the item remains in the processed container with `publishedToSharePoint: false` for retry.

**Authentication:**
- Azure AD app registration with application permissions for Microsoft Graph API.
- Credentials: Client ID, Client Secret (or certificate), Tenant ID - stored as environment variables.
- Required Graph API permission: `Sites.ReadWrite.All` or `Sites.Manage.All`.

**Acceptance Criteria:**
- Every classified document from both KWatch and Google Alerts pipelines shall be published to SharePoint.
- Publishing failures shall not block or delay the classification pipeline.
- Documents that fail to publish shall be identifiable via the `publishedToSharePoint: false` flag for manual retry.
- The unified schema shall be consistent regardless of whether the source is KWatch or Google Alerts.

---

### 5.8 FR-API-08: Operational Alert Email System (Status: Planned)

**Description:** The system shall send automated email notifications to designated operators when internal pipeline conditions indicate degraded operation, resource pressure, or repeated failures requiring human attention. Unlike the adverse event notifier (which is content-driven), operational alerts are infrastructure- and health-driven, they fire based on system state thresholds, not classification results.

**Trigger Conditions:**

| Trigger ID | Condition | Threshold / Criteria |
|------------|-----------|----------------------|
| OA-01 | KWatch queue nearing capacity | Queue size ≥ 80% of `MAX_CLASSIFICATION_QUEUE_SIZE` |
| OA-02 | KWatch queue full - items being dropped | Queue reaches `MAX_CLASSIFICATION_QUEUE_SIZE` and an item is rejected |
| OA-03 | High RSS feed failure rate in a scrape cycle | ≥ 10% of configured feeds fail (parse error, timeout, or HTTP error) in a single cycle |
| OA-04 | Complete scrape cycle failure | All feeds in a scrape cycle fail |
| OA-05 | Scrape cycle timeout | A scrape cycle runs beyond 2x the expected maximum duration |
| OA-06 | Worker pool crash storm | ≥ 3 worker crashes within a 5-minute rolling window |
| OA-07 | All workers simultaneously unavailable | No `ready` worker is available for a configurable duration (e.g., ≥ 30 seconds) |
| OA-08 | Repeated Cosmos DB write failures | ≥ 5 consecutive write failures to any container within a batch or scrape cycle |
| OA-09 | Translation service unreachable (future) | Translation service returns errors or times out for ≥ N consecutive requests |

**Notification Content (per alert):**
- Alert identifier (OA-XX) and human-readable title
- Timestamp of the triggering event
- Current system state values (e.g., queue depth, failure count, worker status)
- Recommended remediation action (e.g., increase queue size, check App Service plan, verify Cosmos DB throughput)
- Environment / deployment identifier (to distinguish prod from staging)

**Deduplication / Suppression:**
- Each trigger type shall be suppressed after the first notification until the condition clears and re-occurs, or until a configurable cooldown period (default: 30 minutes) elapses, to prevent alert storms.

**Architecture:** Email delivery mechanism (SMTP, Azure Communication Services, or SendGrid) and recipient list management are shared with the adverse event notifier module and shall use the same delivery infrastructure. Recipient lists shall be configurable without code changes.

**Acceptance Criteria:**
- Operational alerts shall be delivered within 2 minutes of the triggering condition being detected.
- Alert delivery failures shall be logged but shall not affect the pipeline path that triggered them.
- Duplicate/repeated alerts for the same unresolved condition shall be suppressed for the configured cooldown period.
- All trigger thresholds shall be configurable via environment variables without code changes.
- The system shall expose a `/api/health` response field indicating the last operational alert sent and its timestamp.

---

## 6. Non-Functional Requirements

### 6.1 NFR-01: Performance

| Requirement | Target |
|-------------|--------|
| Webhook Response Time | < 50ms (immediate HTTP 200, async processing) |
| Classification Throughput | Support processing 10 items per 60-second batch cycle |
| Health API Response Time | < 100ms (no database queries) |
| RSS Scrape Cycle Completion | < 15 minutes for 50+ feeds (including content fetch) |
| Content Fetch Timeout | 10 seconds per article (abort after) |
| Worker Initialization | < 120 seconds for all workers to reach ready state |

### 6.2 NFR-02: Scalability

| Requirement | Description |
|-------------|-------------|
| Worker Scaling | The number of classification workers shall be configurable via environment variable without code changes |
| Queue Capacity | The maximum queue size shall be configurable to handle burst traffic |
| Feed Scaling | New RSS feeds can be added by updating the JSON config file without code changes |
| Rule Scaling | New brand queries can be added to the CSV without code changes; the system loads all rules at startup |

### 6.3 NFR-03: Reliability & Fault Tolerance

| Requirement | Description |
|-------------|-------------|
| Worker Crash Recovery | Crashed worker processes shall be automatically restarted without manual intervention |
| Graceful Shutdown | On SIGTERM/SIGINT, the system shall stop accepting new items, finish in-progress work where possible, and terminate workers cleanly |
| Pipeline Isolation | Failure to process a single item shall not affect other items in the same batch |
| RSS Feed Resilience | A failing RSS feed shall not prevent other feeds from being scraped |
| Database Conflict Handling | Cosmos DB 409 conflicts shall be handled gracefully (duplicate recovery for KWatch, skip for Google Alerts) |
| Scraper Mutual Exclusion | Only one scrape cycle shall run at a time to prevent duplicate processing |

### 6.4 NFR-04: Security

| Requirement | Description |
|-------------|-------------|
| Secret Management | Database credentials, API keys, and service secrets shall be stored in environment variables, never in code or config files |
| CORS | Cross-origin request handling shall be enabled via configurable CORS middleware |
| Input Validation | All webhook payloads shall be validated for required fields before processing |
| No Authentication (Current) | The current system does not implement API authentication (acceptable for internal/VPN-only deployment) |
| SharePoint Auth (Future) | SharePoint integration shall use OAuth 2.0 client credentials flow via Azure AD app registration |

### 6.5 NFR-05: Maintainability

| Requirement | Description |
|-------------|-------------|
| Modular Architecture | The system shall maintain separation between ingestion, classification, storage, and API layers |
| Config-Driven Rules | Brand queries, RSS feeds, blocklists, and model parameters shall be configurable without code changes |
| Structured Logging | All pipeline stages shall produce structured log messages with consistent prefixes (e.g., `[KWatchQueue]`, `[GoogleAlerts]`, `[Worker-N]`) |
| Test Coverage | Core services (classification, worker pool, queue) shall have unit and integration test coverage |

### 6.6 NFR-06: Deployment

| Requirement | Description |
|-------------|-------------|
| Docker Support | The system shall be deployable as a Docker container with all models pre-baked into the image |
| Azure App Service | The system shall run on Azure App Service (both Linux containers and Windows via IIS/iisnode) |
| Single-Instance Design | The system is designed for single-instance deployment; horizontal scaling requires external coordination |
| Health Monitoring | The `/api/health` endpoint shall be usable as an Azure App Service health probe |

---

## 7. External Interface Requirements

### 7.1 KWatch Webhook Interface

| Property | Value |
|----------|-------|
| Protocol | HTTP/HTTPS |
| Method | POST |
| Endpoint | `/api/webhook/kwatch` |
| Content Type | `application/json` |
| Direction | Inbound (KWatch → PRISM) |
| Authentication | None (network-level security assumed) |

**Payload:** See Section 3.1 for field definitions.

### 7.2 Google Alerts RSS Interface

| Property | Value |
|----------|-------|
| Protocol | HTTPS |
| Format | RSS 2.0 / Atom |
| Direction | Outbound (PRISM → Google) |
| Authentication | None (public feeds) |
| Rate Limiting | Controlled by scrape interval (2 hours default) |

**Data Extracted:** Feed entries with title, link (Google redirect URL), description/snippet, publication date.

### 7.3 Azure Cosmos DB Interface

| Property | Value |
|----------|-------|
| Protocol | HTTPS (Cosmos DB REST API via SDK) |
| SDK | `@azure/cosmos` v4.9.0 |
| Authentication | Primary key (endpoint + key from environment variables) |
| Database | Single database (configurable name) |
| Containers | 5 containers (see Section 4 of SDD for schemas) |
| Operations | Create (insert), Read (point read, query), Upsert (state documents) |

### 7.4 Microsoft Graph API Interface (Future - SharePoint)

| Property | Value |
|----------|-------|
| Protocol | HTTPS |
| API Version | Microsoft Graph v1.0 |
| Authentication | OAuth 2.0 Client Credentials (Azure AD app registration) |
| Direction | Outbound (PRISM → SharePoint Online) |
| Operations | Create list items |
| Required Permissions | `Sites.ReadWrite.All` |

**Credentials Required:** Tenant ID, Client ID, Client Secret - stored as environment variables.

### 7.5 Translation Service Interface (Future)

| Property | Value |
|----------|-------|
| Protocol | HTTP/HTTPS |
| Direction | Outbound (PRISM → Translation Service) |
| Authentication | Internal service communication (to be determined) |
| Deployment | Separate Azure App Service |
| Engine | Argos Translate (open-source neural MT) |
| Supported Languages | 23 languages → English |

**Request:** Source text + source language code.
**Response:** Translated English text.

---

*End of SRS Document*
