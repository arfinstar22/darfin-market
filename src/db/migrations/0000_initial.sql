CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Makassar',
  language TEXT NOT NULL DEFAULT 'id',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_class TEXT NOT NULL DEFAULT 'crypto',
  asset_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT,
  provider TEXT NOT NULL,
  market_pair TEXT,
  quote_currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS watchlist_user_provider_asset_quote_idx
  ON watchlist_items (user_id, provider, asset_id, quote_currency);
CREATE INDEX IF NOT EXISTS watchlist_user_id_idx
  ON watchlist_items (user_id);

CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  provider TEXT NOT NULL,
  market_pair TEXT,
  quote_currency TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('above', 'below')),
  target_price NUMERIC(38, 18) NOT NULL CHECK (target_price > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'paused', 'deleted')),
  last_observed_price NUMERIC(38, 18),
  last_observed_at TIMESTAMPTZ,
  triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_alerts_status_provider_symbol_idx
  ON price_alerts (status, provider, symbol);
CREATE INDEX IF NOT EXISTS price_alerts_user_status_idx
  ON price_alerts (user_id, status);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  market_pair TEXT,
  quote_currency TEXT NOT NULL,
  price NUMERIC(38, 18) NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS market_snapshots_lookup_idx
  ON market_snapshots (provider, asset_id, quote_currency, observed_at DESC);

CREATE TABLE IF NOT EXISTS provider_health (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'healthy',
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_code TEXT,
  latency_ms INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
