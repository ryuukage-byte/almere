-- Almere & Co — PostgreSQL Schema for Transaction Ledger & Portfolio Engine

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    reference_id VARCHAR(64) UNIQUE,
    type VARCHAR(32) NOT NULL, -- BUY, SELL, DEPOSIT, WITHDRAWAL, TRANSFER, FEE
    asset VARCHAR(32) NOT NULL, -- BTC, HYPE, IDR, USDC, etc.
    quantity NUMERIC(24, 8) NOT NULL DEFAULT 0,
    rate_idr NUMERIC(24, 2) DEFAULT 0,
    amount_idr NUMERIC(24, 2) DEFAULT 0,
    fee_idr NUMERIC(24, 2) DEFAULT 0,
    total_received NUMERIC(24, 8) DEFAULT 0,
    currency VARCHAR(16) DEFAULT 'IDR',
    tx_timestamp TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) DEFAULT 'COMPLETED', -- COMPLETED, PENDING, CANCELLED
    source VARCHAR(64) DEFAULT 'TRIV_SCREENSHOT',
    raw_ocr JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(tx_timestamp);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_value_usd NUMERIC(24, 2) NOT NULL,
    total_value_idr NUMERIC(24, 2) NOT NULL,
    holdings_json JSONB NOT NULL,
    cash_idr NUMERIC(24, 2) DEFAULT 0,
    cash_usd NUMERIC(24, 2) DEFAULT 0,
    btc_price_usd NUMERIC(24, 2),
    hype_price_usd NUMERIC(24, 2),
    usd_idr_rate NUMERIC(24, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_time ON portfolio_snapshots(snapshot_time);
