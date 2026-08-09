-- Listener accounts have no artist identity until upgrade to artist.
-- username / public_slug / site_name stay NULL for listeners.
--
-- username may be missing on DBs created before a dedicated ADD COLUMN migration;
-- add it idempotently before relaxing NOT NULL (027 already adds public_slug).

ALTER TABLE users
ADD COLUMN IF NOT EXISTS username VARCHAR(255);

ALTER TABLE users
ALTER COLUMN username DROP NOT NULL;

COMMENT ON COLUMN users.username IS 'Artist handle, NULL for listener accounts until upgrade';
