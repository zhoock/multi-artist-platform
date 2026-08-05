-- PR-10.2: one subscription row per user (prevents duplicate active rows on concurrent first checkout).

-- Keep the newest row per user when duplicates exist (legacy data safety).
DELETE FROM subscriptions a
USING subscriptions b
WHERE a.user_id = b.user_id
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id_unique ON subscriptions (user_id);

COMMENT ON INDEX idx_subscriptions_user_id_unique IS 'PR-10.2: enforce single subscription row per user';
