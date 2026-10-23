-- Migration 020: Persistent per-user notification records.
-- Retains notification content and read state independently of live delivery.

CREATE TABLE IF NOT EXISTS notifications (
    id               BIGSERIAL   PRIMARY KEY,
    recipient        TEXT        NOT NULL REFERENCES profiles(address) ON DELETE CASCADE,
    type             TEXT        NOT NULL,
    actor            TEXT,
    object_type      TEXT,
    object_id        TEXT,
    payload          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    read_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON notifications (recipient, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications (recipient, created_at DESC)
    WHERE read_at IS NULL;
