-- Per-artist active flag: inactive artists stay in collection history without premium access.

ALTER TABLE user_archive
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

UPDATE user_archive SET is_active = true WHERE is_active IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_archive_user_active
  ON user_archive (user_id, is_active);
