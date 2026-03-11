# CSV Processor — Backend System

A backend system that accepts CSV file uploads, persists data to PostgreSQL, publishes events via Kafka, and serves cached responses through Redis. Built with Node.js as two independent services.

## Architecture

```text
┌─────────────┐       ┌─────────────┐       ┌──────────────────┐
│   Client    │       │    API      │       │    PostgreSQL    │
│   (curl/    │────▶  │  Service    │────▶  │ (records table)  │
│  Postman)   │       │   :3000     │       │      :5432       │
│             │◀────  │             │       └──────────────────┘
└─────────────┘       └──────┬──────┘                 │                 
                             │                        │                 
                          Publish                  Query                
                           Event                      │                 
                             ▼                        │                 
                      ┌──────────────┐                │                 
                      │    Kafka     │                │                 
                      │    :9092     │                │                 
                      └──────┬──────┘                 │                 
                             │                        │                 
                          Consume                     │                 
                           Event                      │                 
                             ▼                        │                 
                      ┌──────────────┐      ┌───────▼──────────┐
                      │  Consumer    │────▶ │      Redis       │
                      │  Service     │      │     (cache)      │
                      │ (standalone) │      │      :6379       │
                      └──────────────┘      └──────────────────┘
                                                      ▲                 
                                                      │                 
                                                  Cache Read            
                                              (with DB fallback)        
                                                      │                 
                                              ┌──────┴──────┐           
                                              │ GET /api/   │           
                                              │  records    │           
                                              └─────────────┘           
```

## Tech Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js
- **Database:** PostgreSQL 16
- **Cache:** Redis 7
- **Message Broker:** Apache Kafka (Confluent 7.5)
- **Containerization:** Docker & Docker Compose

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)
- No Node.js installation required — everything runs in containers

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd csv-processor

# 2. Start all services
docker-compose up --build

# Wait for all services to be healthy. You should see:
#   csv-api       | ✅ API server running on port 3000
#   csv-consumer  | ⏳ Waiting for messages...

# 3. Upload a CSV file
curl -X POST http://localhost:3000/api/upload \
  -F "file=@sample-data/products.csv"

# 4. Fetch records (served from cache)
curl http://localhost:3000/api/records

# 5. Check system health
curl http://localhost:3000/api/health
```

## API Endpoints

### POST `/api/upload`
Upload a CSV file for processing.

```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@sample-data/products.csv"
```

Response:

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

### GET `/api/records`
Retrieve all records. Serves from Redis cache when available, falls back to PostgreSQL.

```bash
curl http://localhost:3000/api/records
```

Response:

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

### GET `/api/health`
Check system health and service connectivity.

```bash
curl http://localhost:3000/api/health
```

Response:

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

## CSV Format
The CSV file must include these required columns: `sku`, `name`, `price`, `quantity`

Optional columns: `description`, `category`

Example:

```csv
sku,name,description,category,price,quantity
SKU001,Widget Alpha,High-quality widget,Electronics,29.99,100
SKU002,Gadget Beta,Compact gadget,Electronics,49.99,50
```

Validation rules:

- `sku`: Required, unique, max 50 characters
- `name`: Required, max 255 characters
- `price`: Required, non-negative number
- `quantity`: Required, non-negative integer
- `description`: Optional, max 1000 characters
- `category`: Optional, max 100 characters
