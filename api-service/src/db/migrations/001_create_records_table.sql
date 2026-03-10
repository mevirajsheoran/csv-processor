-- ============================================
-- Migration 001: Create records table
-- Idempotent — safe to run multiple times
-- ============================================

CREATE TABLE IF NOT EXISTS records (
    id          SERIAL PRIMARY KEY,
    sku         VARCHAR(50) UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    category    VARCHAR(100) DEFAULT '',
    price       DECIMAL(10, 2) NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index on SKU for fast upsert conflict detection
-- CREATE INDEX IF NOT EXISTS prevents errors on re-run
CREATE INDEX IF NOT EXISTS idx_records_sku ON records(sku);

-- Index on category for potential filtered queries
CREATE INDEX IF NOT EXISTS idx_records_category ON records(category);