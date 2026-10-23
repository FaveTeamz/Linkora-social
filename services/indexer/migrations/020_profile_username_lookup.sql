-- Supports case-insensitive exact username resolution in the profile API.
CREATE INDEX IF NOT EXISTS idx_profiles_username_lower
    ON profiles (lower(username));
