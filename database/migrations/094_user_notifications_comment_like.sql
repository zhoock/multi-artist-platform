-- Allow comment_like notifications + dedupe per actor/comment/recipient.

ALTER TABLE user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_known;

ALTER TABLE user_notifications
  ADD CONSTRAINT user_notifications_type_known
  CHECK (type IN ('comment', 'comment_like'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_comment_like_dedupe
  ON user_notifications (recipient_user_id, comment_id, actor_user_id)
  WHERE type = 'comment_like';

COMMENT ON INDEX idx_user_notifications_comment_like_dedupe IS
  'One comment_like notification per liker per comment per recipient.';
