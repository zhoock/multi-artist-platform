-- Artist alert when a listener adds them to an active premium collection.

ALTER TABLE user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_known;

ALTER TABLE user_notifications
  ALTER COLUMN comment_id DROP NOT NULL,
  ALTER COLUMN actor_user_id DROP NOT NULL;

ALTER TABLE user_notifications
  ADD CONSTRAINT user_notifications_type_known
  CHECK (type IN ('comment', 'comment_like', 'collection_add'));

ALTER TABLE user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_fields;

ALTER TABLE user_notifications
  ADD CONSTRAINT user_notifications_type_fields
  CHECK (
    (
      type IN ('comment', 'comment_like')
      AND comment_id IS NOT NULL
      AND actor_user_id IS NOT NULL
    )
    OR (
      type = 'collection_add'
      AND comment_id IS NULL
      AND actor_user_id IS NULL
    )
  );

COMMENT ON CONSTRAINT user_notifications_type_fields ON user_notifications IS
  'Comment types require comment/actor; collection_add is anonymous (no listener identity).';
