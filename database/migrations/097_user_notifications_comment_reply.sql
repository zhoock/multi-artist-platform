-- Reply-to-comment alerts use type comment_reply (same row shape as comment).

ALTER TABLE user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_known;

ALTER TABLE user_notifications
  ADD CONSTRAINT user_notifications_type_known
  CHECK (type IN ('comment', 'comment_reply', 'comment_like', 'collection_add'));

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
  );
