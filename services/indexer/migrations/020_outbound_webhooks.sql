-- Migration 020: Outbound webhook subscriptions and delivery history.
-- Delivery rows are retained for seven days by the indexer dispatcher.
-- Rollback: DROP TABLE webhook_deliveries; DROP TABLE webhook_subscriptions;

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id           BIGSERIAL PRIMARY KEY,
    owner_address TEXT        NOT NULL,
    url           TEXT        NOT NULL,
    secret        TEXT        NOT NULL,
    event_types   TEXT[]      NOT NULL DEFAULT ARRAY['*']::TEXT[],
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_owner
    ON webhook_subscriptions (owner_address, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id              BIGSERIAL PRIMARY KEY,
    webhook_id      BIGINT      NOT NULL,
    event_id        TEXT        NOT NULL,
    event_type      TEXT        NOT NULL,
    payload         JSONB       NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'delivering', 'succeeded', 'failed')),
    attempts        INTEGER     NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempt_at TIMESTAMPTZ,
    response_status INTEGER,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    UNIQUE (webhook_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
    ON webhook_deliveries (next_attempt_at, id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at
    ON webhook_deliveries (created_at);