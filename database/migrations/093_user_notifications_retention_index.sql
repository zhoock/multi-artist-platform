-- Retention cleanup scans by age; recipient listing unchanged from 092.

CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at
  ON user_notifications (created_at);

COMMENT ON INDEX idx_user_notifications_created_at IS
  'Supports scheduled purge of notifications older than retention window.';
