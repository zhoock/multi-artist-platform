-- Artist alert when a listener successfully purchases their album (anonymous buyer).

ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS album_cover_path TEXT NOT NULL DEFAULT '';

ALTER TABLE user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_known;

ALTER TABLE user_notifications
  ADD CONSTRAINT user_notifications_type_known
  CHECK (type IN ('comment', 'comment_reply', 'comment_like', 'collection_add', 'album_purchase'));

ALTER TABLE user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_fields;

ALTER TABLE user_notifications
  ADD CONSTRAINT user_notifications_type_fields
  CHECK (
    (
      type IN ('comment', 'comment_reply', 'comment_like')
      AND comment_id IS NOT NULL
      AND actor_user_id IS NOT NULL
    )
    OR (
      type = 'collection_add'
      AND comment_id IS NULL
      AND actor_user_id IS NOT NULL
    )
    OR (
      type = 'album_purchase'
      AND comment_id IS NULL
      AND actor_user_id IS NULL
      AND purchase_order_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_album_purchase_dedupe
  ON user_notifications (purchase_order_id)
  WHERE type = 'album_purchase';

COMMENT ON INDEX idx_user_notifications_album_purchase_dedupe IS
  'One album_purchase notification per paid order (webhook/poll idempotency).';

COMMENT ON CONSTRAINT user_notifications_type_fields ON user_notifications IS
  'Comment types require comment/actor; collection_add stores actor_user_id; album_purchase is anonymous (no buyer identity).';
