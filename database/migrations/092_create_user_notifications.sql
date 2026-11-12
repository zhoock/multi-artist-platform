-- Per-user notifications (MVP: album comment alerts). Backend-only via Netlify Functions.

CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL DEFAULT 'comment',
  comment_id UUID NOT NULL REFERENCES album_comments(id) ON DELETE CASCADE,
  album_id TEXT NOT NULL,
  artist_slug TEXT NOT NULL,
  album_title TEXT NOT NULL DEFAULT '',
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_notifications_type_known CHECK (type IN ('comment'))
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_created
  ON user_notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_unread
  ON user_notifications (recipient_user_id, created_at DESC)
  WHERE is_read = false;

COMMENT ON TABLE user_notifications IS
  'In-app notifications for authenticated users; MVP type comment only.';
COMMENT ON COLUMN user_notifications.album_id IS 'Public albums.album_id slug';
COMMENT ON COLUMN user_notifications.artist_slug IS 'Artist public_slug for deep-link navigation';

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON user_notifications FROM PUBLIC;
REVOKE ALL ON user_notifications FROM anon;
REVOKE ALL ON user_notifications FROM authenticated;
