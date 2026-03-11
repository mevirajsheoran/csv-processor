# CSV Processor — Backend System

A production-grade backend system that accepts CSV file uploads, persists data to PostgreSQL using idempotent upserts, publishes events via Apache Kafka, and serves cached responses through Redis with automatic database fallback. Built as two independent Node.js microservices.

---

## Architecture

```text
                ┌──────────────────────────────────────────────┐
                │              API SERVICE (:3000)             │
   CSV File     │                                              │
────────────────▶ │ POST /api/upload                         │
                │ │                                            │
                │ ├─ 1. Parse CSV (stream-based)               │
                │ ├─ 2. Validate all rows (Joi schema)         │
                │ ├─ 3. Bulk upsert → PostgreSQL               │
                │ │ (single query, single transaction)         │
                │ └─ 4. Publish event → Kafka                  │
                │ (non-blocking, never fails upload)           │
                │                                              │
◀──────────────── │ GET /api/records                           │
 JSON response  │ │                                            │
                │ ├─ Try Redis cache                           │
                │ │ ├─ HIT → return (source: "cache")          │
                │ │ └─ MISS or DOWN ──┐                        │
                │ │                   ▼                        │
                │ ├─ Query PostgreSQL (source: "database")     │
                │ └─ Repopulate cache (silent on failure)      │
                │                                              │
                │ GET /api/health                              │
                │ └─ Check PG + Redis + Kafka connectivity     │
                └──────────────┬───────────────────────────────┘
                               │
                          Kafka Event
                      "RECORDS_UPLOADED"
                               │
                ┌──────────────▼───────────────────────────────┐
                │ CONSUMER SERVICE (standalone)                │
                │                                              │
                │ 1. Receive event from Kafka                  │
                │ 2. Check deduplication (Redis SET NX EX)     │
                │ 3. Query ALL records from PostgreSQL         │
                │ 4. Refresh Redis cache                       │
                │ 5. Commit Kafka offset (manual)              │
                │                                              │
                └──────────────────────────────────────────────┘

┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ PostgreSQL  │ │    Redis    │ │    Kafka    │ │  Zookeeper  │
│    :5432    │ │    :6379    │ │    :9092    │ │    :2181    │
│ (permanent  │ │ (fast cache │ │  (message   │ │   (Kafka    │
│  storage)   │ │  + dedup)   │ │   broker)   │ │  metadata)  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 | Runtime for both services |
| Express.js | 4.x | HTTP framework for REST API |
| PostgreSQL | 16 | Persistent data storage |
| Redis | 7 | Caching layer + event deduplication |
| Apache Kafka | 7.5 (Confluent) | Event-driven messaging |
| Docker | — | Container orchestration |
| Jest | 29 | Unit testing framework |
| Winston | 3.x | Structured logging |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- No Node.js installation required — everything runs in containers

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd csv-processor

# 2. Start all services (infrastructure + application)
docker-compose up --build

# 3. Wait for these logs to appear:
#    csv-api       | ✅ API server running on port 3000
#    csv-consumer  | ⏳ Waiting for messages...

# 4. Upload a CSV file
curl -X POST http://localhost:3000/api/upload \
  -F "file=@sample-data/products.csv"

# 5. Fetch all records
curl http://localhost:3000/api/records

# 6. Check system health
curl http://localhost:3000/api/health
```

## API Endpoints

### POST /api/upload
Upload a CSV file for processing. Records are upserted into PostgreSQL and a Kafka event is published.

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@sample-data/products.csv"
```
Success Response (200):

```json
{
  "success": true,
  "message": "CSV file processed successfully",
  "data": {
    "uploadId": "550e8400-e29b-41d4-a716-446655440000",
    "fileName": "products.csv",
    "totalRecords": 10,
    "inserted": 10,
    "updated": 0,
    "kafkaPublished": true
  },
  "meta": {
    "timestamp": "2026-03-10T14:30:00.000Z"
  }
}
```
Validation Error Response (400):

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "CSV validation failed: 3 error(s) in 2 row(s)",
    "details": [
      { "row": 3, "field": "price", "message": "Price must be a non-negative number", "value": "abc" },
      { "row": 7, "field": "sku", "message": "SKU is required", "value": "" },
      { "row": 7, "field": "quantity", "message": "Quantity must be a non-negative integer", "value": "-5" }
    ]
  }
}
```

### GET /api/records
Retrieve all records. Serves from Redis cache when available, with automatic PostgreSQL fallback.

```bash
curl http://localhost:3000/api/records
```

Response (200):

```json
{
  "success": true,
  "message": "Records retrieved successfully",
  "data": {
    "records": [
      {
        "id": 1,
        "sku": "SKU001",
        "name": "Widget Alpha",
        "description": "High-quality aluminum widget",
        "category": "Electronics",
        "price": 29.99,
        "quantity": 100,
        "created_at": "2026-03-10T14:30:00.000Z",
        "updated_at": "2026-03-10T14:30:00.000Z"
      }
    ],
    "count": 10
  },
  "meta": {
    "source": "cache",
    "timestamp": "2026-03-10T14:30:00.000Z"
  }
}
```

The `meta.source` field indicates where the data was served from:

- `"cache"` — served from Redis (fast path)
- `"database"` — served from PostgreSQL (Redis was empty or unavailable)

### GET /api/health
Check system health and connectivity of all dependent services.

```bash
curl http://localhost:3000/api/health
```

Healthy Response (200):

```json
{
  "status": "healthy",
  "services": {
    "postgresql": "connected",
    "redis": "connected",
    "kafka": "connected"
  },
  "uptime": "2h 15m 30s",
  "timestamp": "2026-03-10T16:45:30.000Z"
}
```

Degraded Response (503):

```json
{
  "status": "degraded",
  "services": {
    "postgresql": "connected",
    "redis": "disconnected",
    "kafka": "connected"
  },
  "uptime": "2h 15m 30s",
  "timestamp": "2026-03-10T16:45:30.000Z"
}
```

## CSV Format
Required columns: `sku, name, price, quantity`
Optional columns: `description, category`

```csv
sku,name,description,category,price,quantity
SKU001,Widget Alpha,High-quality widget,Electronics,29.99,100
SKU002,Gadget Beta,Compact gadget,Electronics,49.99,50
```

### Validation Rules
| Field | Rules |
|---|---|
| sku | Required, unique, max 50 characters |
| name | Required, max 255 characters |
| price | Required, must be a non-negative number |
| quantity | Required, must be a non-negative integer |
| description | Optional, max 1000 characters |
| category | Optional, max 100 characters |

### Handling Edge Cases
| Scenario | Behavior |
|---|---|
| No file attached | 400 error with clear message |
| Empty file (0 bytes) | 400 — "CSV file is empty" |
| Headers but no data rows | 400 — "CSV file has headers but no data rows" |
| Non-CSV file uploaded | 400 — "Only CSV files are allowed" |
| File exceeds 5MB | 400 — "File size exceeds the 5MB limit" |
| Missing required columns | 400 — lists which columns are missing |
| Invalid data in rows | 400 — lists ALL errors across ALL rows with row numbers |
| Duplicate SKUs within file | Warning returned, last occurrence is used |
| Re-upload same file | All records updated (not duplicated) — idempotent |

## Resilience & Fault Tolerance

### Kafka Failure During Upload
If Kafka is unavailable when a CSV is uploaded:
- The data is still saved to PostgreSQL (data integrity preserved)
- The response includes `"kafkaPublished": false` to indicate the event was not published
- The upload is not blocked or failed — Kafka is non-critical for data persistence
- Cache refresh will not happen until the next successful upload triggers an event

### Redis Failure During Fetch
If Redis is unavailable when records are requested:
- The API does not crash — it falls back to PostgreSQL
- Response includes `"source": "database"` to indicate the fallback
- Two separate try-catch blocks protect Redis read and write operations independently
- A failed cache read does not prevent a cache write attempt (and vice versa)

### Redis Failure During Consumer Processing
If Redis is unavailable when the consumer processes a Kafka event:
- The consumer cannot deduplicate or refresh cache — both require Redis
- The consumer throws an error and does not commit the Kafka offset
- Kafka redelivers the message when the consumer polls again
- When Redis recovers, the message is processed successfully

### Kafka Duplicate Message Delivery
Kafka guarantees at-least-once delivery, meaning the same message may arrive more than once:
- Each event has a unique `eventId` (UUID v4)
- The consumer uses Redis `SET NX EX` to track processed event IDs
- Duplicate events are detected and skipped with a log message
- Deduplication keys expire after 24 hours (automatic cleanup)

### Database Transaction Safety
CSV records are saved using a single bulk upsert within a database transaction:
- A dedicated client is obtained from the connection pool (`pool.connect()`)
- All queries run on the same connection — `BEGIN`, `INSERT`, `COMMIT`
- If any row fails, the entire batch is rolled back — no partial writes
- The client is always released back to the pool in a `finally` block, even on error
- This prevents connection pool exhaustion under failure conditions

### Concurrent Uploads
If two CSV files are uploaded simultaneously:
- Each upload runs in its own database transaction
- PostgreSQL's `ON CONFLICT` handles row-level conflicts via MVCC
- The consumer always queries the database for the latest state — the cache reflects the final result regardless of upload order

### Graceful Shutdown
Both services handle SIGTERM (Docker stop) and SIGINT (Ctrl+C):
- HTTP server stops accepting new requests
- In-flight requests are allowed to complete
- Kafka consumer/producer disconnects cleanly
- Redis connection is closed
- Database connection pool is drained
- A 15-second timeout prevents hanging — forces exit if cleanup stalls
- Duplicate signal protection prevents concurrent shutdown sequences

### Startup Resilience
Both services use retry with exponential backoff when connecting to dependencies:
- If PostgreSQL isn't ready yet → retry up to 5 times (2s, 4s, 8s, 16s, 30s)
- If Redis isn't ready yet → same retry pattern
- If Kafka isn't ready yet → retry up to 5 times (3s, 6s, 12s, 24s, 30s)
- If all retries fail → service exits with error (prevents unhealthy state)

### Environment Variable Validation
Both services validate required environment variables at startup:
- If any required variable is missing, the service refuses to start
- A clear error message lists the missing variables
- This prevents cryptic runtime errors minutes after startup

## Project Structure
```text
csv-processor/
├── docker-compose.yml              # Full infrastructure + application stack
├── .env.example                    # Environment variable template
├── .gitignore
├── README.md
├── sample-data/
│   ├── products.csv                # 10 test products
│   └── products-updated.csv        # Same SKUs with updated prices
├── postman/
│   └── csv-processor.postman_collection.json
│
├── api-service/                    # SERVICE 1: REST API (Express.js)
│   ├── Dockerfile
│   ├── package.json
│   ├── jest.config.js
│   └── src/
│       ├── app.js                  # Express app (routes, middleware)
│       ├── server.js               # Entry point (startup, shutdown)
│       ├── config/
│       │   └── index.js            # Env validation, centralized config
│       ├── controllers/
│       │   ├── upload.controller.js
│       │   ├── records.controller.js
│       │   └── health.controller.js
│       ├── db/
│       │   ├── pool.js             # PostgreSQL connection pool
│       │   ├── migrate.js          # Auto-migration on startup
│       │   └── migrations/
│       │       └── 001_create_records_table.sql
│       ├── middleware/
│       │   ├── fileUpload.js       # Multer: CSV only, 5MB limit
│       │   └── errorHandler.js     # Global error handler
│       ├── routes/
│       │   ├── upload.routes.js
│       │   ├── records.routes.js
│       │   └── health.routes.js
│       ├── services/
│       │   ├── csv.service.js      # Stream-based CSV parsing
│       │   ├── database.service.js # Bulk upsert + query
│       │   ├── cache.service.js    # Redis read/write with fallback
│       │   └── kafka.producer.js   # Event publishing
│       ├── validators/
│       │   └── csv.validator.js    # Joi schema, all-error collection
│       └── utils/
│           ├── logger.js           # Winston structured logging
│           ├── errors.js           # Custom error classes
│           ├── response.js         # Standardized response format
│           ├── retry.js            # Connection retry with backoff
│           └── shutdown.js         # Graceful shutdown handler
│
└── consumer-service/               # SERVICE 2: Kafka Consumer (standalone)
    ├── Dockerfile
    ├── package.json
    ├── jest.config.js
    └── src/
        ├── index.js                # Entry point (startup, shutdown)
        ├── config/
        │   └── index.js
        ├── consumer.js             # KafkaJS consumer, manual offset commit
        ├── handlers/
        │   └── records-uploaded.handler.js
        ├── services/
        │   ├── cache.service.js
        │   ├── database.service.js
        │   └── deduplication.service.js
        └── utils/
            ├── logger.js
            ├── retry.js
            └── shutdown.js
```

## Environment Variables
| Variable | Description | Default | Required |
|---|---|---|---|
| PORT | API server port | 3000 | Yes |
| DATABASE_URL | PostgreSQL connection string | — | Yes |
| DB_POOL_SIZE | Maximum database connections | 10 | No |
| REDIS_HOST | Redis hostname | — | Yes |
| REDIS_PORT | Redis port | — | Yes |
| CACHE_TTL | Cache time-to-live in seconds | 3600 | No |
| KAFKA_BROKERS | Kafka broker addresses (comma-separated) | — | Yes |
| KAFKA_TOPIC | Kafka topic name | — | Yes |
| KAFKA_GROUP_ID | Consumer group ID | csv-consumer-group | Yes (consumer) |
| KAFKA_CLIENT_ID_API | API Kafka client identifier | csv-api-producer | No |
| KAFKA_CLIENT_ID_CONSUMER | Consumer Kafka client identifier | csv-consumer | No |
| LOG_LEVEL | Logging level (debug, info, warn, error) | info | No |

Note: When running inside Docker, use service names (`postgres`, `redis`, `kafka:29092`) instead of localhost. The `docker-compose.yml` handles this automatically via environment variables set on each service.

## Running Tests
```bash
# API service tests with coverage
cd api-service
npm install
npm test

# Consumer service tests with coverage
cd ../consumer-service
npm install
npm test
```
Tests use Jest with mocked dependencies — no running database, Redis, or Kafka required.

## Local Development (Without Docker for Node.js)
For development with hot-reload, run infrastructure in Docker and Node.js services locally:

```bash
# 1. Start infrastructure only
docker-compose up postgres redis zookeeper kafka

# 2. Copy environment template
cp .env.example .env

# 3. Start API service (terminal 1)
cd api-service
npm install
npm run dev

# 4. Start consumer service (terminal 2)
cd consumer-service
npm install
npm run dev
```

## Design Decisions

### Why Bulk Upsert Instead of Row-by-Row Insert?
A CSV with 50 rows results in a single SQL query with 50 value tuples, not 50 individual queries. This reduces database round trips from N to 1 and allows atomic rollback if any row fails.

### Why Does the Consumer Query the Database Instead of Using the Kafka Payload?
Three reasons:
1. Database is the source of truth — the cache should reflect the current DB state, not a snapshot from a Kafka message
2. Kafka messages stay small — only metadata (file name, counts), not the full record set
3. Handles concurrent uploads — if two uploads happen quickly, the consumer always gets the final state from the DB

### Why Separate Services Instead of One Monolith?
The assessment requires the consumer to be a "standalone Node.js process." Beyond the requirement, this separation means:
- The consumer can be scaled independently
- A consumer crash doesn't affect the API
- They can be deployed and updated independently

### Why Manual Kafka Offset Commit?
Auto-commit marks a message as "read" immediately, before processing completes. If the consumer crashes mid-processing, the message is lost. Manual commit only marks it "read" after successful processing, ensuring no data loss.

### Why Two Try-Catch Blocks Around Redis in the Fetch API?
One for the cache read, one for the cache write. If the read fails (Redis is down), we still attempt the write after querying the database — Redis might have recovered in the milliseconds between. If the write also fails, the request still succeeds with database data.

## Data Reset
```bash
# Reset everything (database + cache + Kafka)
docker-compose down -v
docker-compose up --build

# Reset cache only
docker exec -it csv-redis redis-cli FLUSHALL

# Reset database only
docker exec -it csv-postgres psql -U postgres -d csv_processor -c "DELETE FROM records;"
```

## Demo Flow
```text
1. docker-compose up --build           → All services start healthy
2. POST /api/upload (products.csv)     → inserted: 10, updated: 0
3. Check consumer logs                 → Event received, cache refreshed
4. GET /api/records                    → source: "cache"
5. POST /api/upload (same file)        → inserted: 0, updated: 10 (idempotent)
6. redis-cli FLUSHALL                  → Cache cleared
7. GET /api/records                    → source: "database" (fallback)
8. GET /api/records                    → source: "cache" (repopulated)
9. docker-compose stop redis           → Redis goes down
10. GET /api/records                   → source: "database" (graceful degradation)
11. GET /api/health                    → status: "degraded", redis: "disconnected"
12. docker-compose start redis         → Redis recovers
13. npm test in both services          → All tests pass with coverage
```
