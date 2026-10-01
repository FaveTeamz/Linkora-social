-- Migration 017: Creator analytics summaries
-- Stores aggregated analytics for creator profiles. Populated and updated
-- by the analytics-oracle service. Each row is a daily snapshot keyed by
-- (creator_address, snapshot_date).
--
-- Rollback: DROP TABLE creator_analytics;

CREATE TABLE IF NOT EXISTS creator_analytics (
    id                   BIGSERIAL    PRIMARY KEY,
    creator_address      TEXT         NOT NULL,
    snapshot_date        DATE         NOT NULL,
    total_posts          INTEGER      NOT NULL DEFAULT 0,
    total_tips_received  BIGINT       NOT NULL DEFAULT 0,
    unique_tippers       INTEGER      NOT NULL DEFAULT 0,
    total_followers      INTEGER      NOT NULL DEFAULT 0,
    follower_delta       INTEGER      NOT NULL DEFAULT 0,
    engagement_rate      NUMERIC(6,4) NOT NULL DEFAULT 0,
    attested_at          TIMESTAMPTZ,
    attestation_sig      TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_analytics_creator_date
    ON creator_analytics (creator_address, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_creator_analytics_creator
    ON creator_analytics (creator_address, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_creator_analytics_date
    ON creator_analytics (snapshot_date DESC);
