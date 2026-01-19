# KWatch Raw Data Migration Scripts

## Purpose
These scripts migrate existing data from the raw KWatch container to the processed container by:
1. Fetching all items from the raw container and saving locally
2. Testing classification without writing to database (dry run)
3. Pushing matched items to the processed container

This is needed because the brand classifier was added after initial data collection, so historical data needs to be retroactively classified.

## Prerequisites
- Node.js installed
- `.env` file configured with Cosmos DB credentials
- Brand queries CSV file at `config/BrandQueries.csv`

---

## Step 1: Fetch Raw Data

```bash
npm run migrate:fetch
```

**What it does:**
- Connects to the raw KWatch container
- Fetches ALL items with pagination
- Saves to `scripts/data/raw-data.json`

**Output:**
- `scripts/data/raw-data.json` - All raw items from the database

---

## Step 2: Test Classification (Dry Run)

```bash
npm run migrate:test
```

**What it does:**
- Loads local data from step 1
- Runs classification on ALL items
- Does NOT write anything to the database
- Shows statistics and breakdown by topic
- Saves results to `scripts/data/classification-results.json`

**Output:**
- `scripts/data/classification-results.json` - Classification results and statistics
- Console output with:
  - Match percentage
  - Breakdown by topic/subtopic
  - Sample processed document
  - Any errors

**Why this step:**
- Verify classification is working correctly
- See what percentage of items will match
- Preview the processed document structure
- Catch any errors BEFORE the actual migration

---

## Step 3: Push to Database

```bash
npm run migrate:push
```

**What it does:**
- Loads local data from step 1
- Classifies each item
- Pushes matched items to the processed container
- Uses `upsert` to handle duplicates gracefully
- Processes in batches with delays to avoid throttling

**Output:**
- Console output with real-time progress
- Final statistics of pushed/skipped items

---

## Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: npm run migrate:fetch                                  │
│  ─────────────────────────────────────────────────────────────  │
│  Cosmos DB (Raw) ───────────────────► raw-data.json            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: npm run migrate:test                                   │
│  ─────────────────────────────────────────────────────────────  │
│  raw-data.json ──► Classification ──► classification-results   │
│                    (NO DB writes)                               │
│                                                                 │
│  ✓ Review results, verify everything looks correct              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: npm run migrate:push                                   │
│  ─────────────────────────────────────────────────────────────  │
│  raw-data.json ──► Classification ──► Cosmos DB (Processed)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Files

All data files are stored in `scripts/data/`:

| File | Description |
|------|-------------|
| `raw-data.json` | All items fetched from raw container |
| `classification-results.json` | Test results with statistics |

These files are gitignored and only used locally for migration.

---

## Configuration

You can adjust these constants in the scripts:

**3-push-to-database.js:**
- `BATCH_SIZE`: Number of items per batch (default: 50)
- `DELAY_BETWEEN_BATCHES`: Milliseconds between batches (default: 500)

---

## Safety Features

- **Idempotent**: Uses `upsert`, can be run multiple times safely
- **Non-destructive**: Does not modify or delete raw data
- **Testable**: Step 2 lets you verify before committing
- **Recoverable**: Local data file means you don't need to re-fetch if push fails

---

## Troubleshooting

### Step 1 fails with authentication error
Check your `.env` file has correct Cosmos DB credentials

### Step 2 shows 0% match rate
- Verify `BrandQueries.csv` is properly formatted
- Check classifier initialization messages for parse errors

### Step 3 is slow
- Reduce `BATCH_SIZE` if getting throttling errors
- Increase `DELAY_BETWEEN_BATCHES` to 1000ms or more

### Out of memory
- The raw-data.json might be too large
- Consider processing in chunks (modify step 3 to read items in batches)
