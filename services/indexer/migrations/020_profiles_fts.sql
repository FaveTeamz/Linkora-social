-- Add display metadata and a generated full-text vector for profile lookup.
-- Rollback (if needed): DROP INDEX IF EXISTS idx_profiles_fts;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS fts;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS bio;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS display_name;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fts TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', concat_ws(' ', username, display_name, bio))
) STORED;

CREATE INDEX IF NOT EXISTS idx_profiles_fts ON profiles USING GIN (fts);
