-- Migration 016: User reputation scores
-- Stores a per-user reputation score derived from on-chain activity
-- (posts, tips sent/received, follows, governance participation).
--
-- Rollback: DROP TABLE reputation_scores;

CREATE TABLE IF NOT EXISTS reputation_scores (
    user_address     TEXT        PRIMARY KEY,
    score            INTEGER     NOT NULL DEFAULT 0,
    posts_count      INTEGER     NOT NULL DEFAULT 0,
    tips_sent        INTEGER     NOT NULL DEFAULT 0,
    tips_received    INTEGER     NOT NULL DEFAULT 0,
    governance_votes INTEGER     NOT NULL DEFAULT 0,
    last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_ledger   INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reputation_scores_score
    ON reputation_scores (score DESC);

CREATE INDEX IF NOT EXISTS idx_reputation_scores_ledger
    ON reputation_scores (updated_ledger);
