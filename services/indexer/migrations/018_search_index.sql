-- Migration 018: Unified full-text search index
-- Materialized view combining profiles and posts into a single search surface.
-- Refreshed by the indexer on each batch commit.
--
-- Rollback: DROP MATERIALIZED VIEW IF EXISTS search_index;

CREATE MATERIALIZED VIEW IF NOT EXISTS search_index AS
SELECT
    'profile'::TEXT          AS entity_type,
    address                  AS entity_id,
    username                 AS title,
    COALESCE(bio, '')        AS body,
    to_tsvector('english',
        COALESCE(username, '') || ' ' || COALESCE(bio, '')
    )                        AS search_vector,
    created_at
FROM profiles
UNION ALL
SELECT
    'post'::TEXT             AS entity_type,
    id                       AS entity_id,
    author                   AS title,
    content                  AS body,
    to_tsvector('english', COALESCE(content, '')) AS search_vector,
    created_at
FROM posts
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_index_entity
    ON search_index (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_search_index_vector
    ON search_index USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_search_index_created_at
    ON search_index (created_at DESC);
