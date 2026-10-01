-- Migration 019: Media attachments
-- Stores references to off-chain media files (images, videos, audio) attached
-- to posts. The content hash is stored for integrity verification; the actual
-- bytes live in off-chain storage (IPFS / CDN).
--
-- Rollback: DROP TABLE media_attachments;

CREATE TABLE IF NOT EXISTS media_attachments (
    id           BIGSERIAL PRIMARY KEY,
    post_id      TEXT      NOT NULL,
    media_type   TEXT      NOT NULL CHECK (media_type IN ('image', 'video', 'audio')),
    url          TEXT      NOT NULL,
    content_hash TEXT      NOT NULL,
    width_px     INTEGER,
    height_px    INTEGER,
    duration_ms  INTEGER,
    size_bytes   BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_attachments_post_id
    ON media_attachments (post_id);

CREATE INDEX IF NOT EXISTS idx_media_attachments_content_hash
    ON media_attachments (content_hash);

ALTER TABLE media_attachments
    ADD CONSTRAINT media_attachments_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES posts(id)
    ON DELETE CASCADE
    NOT VALID;
