-- Per-artist lock: snapshot of subscription.expires_at at add time.

ALTER TABLE user_archive
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

COMMENT ON COLUMN user_archive.locked_until IS
  'Artist cannot be removed until this time (snapshot of subscription.expires_at at add)';

-- Active subscribers: lock existing archive entries until current period ends.
UPDATE user_archive ua
SET locked_until = s.expires_at
FROM subscriptions s
WHERE s.user_id = ua.user_id
  AND s.status = 'active'
  AND s.expires_at IS NOT NULL
  AND s.expires_at > NOW()
  AND ua.locked_until IS NULL;

-- Users without active subscription: locked_until stays NULL.
