-- collection_add: persist actor_user_id; public actor snapshot only when actor is artist at insert time.

DELETE FROM user_notifications
WHERE type = 'collection_add' AND actor_user_id IS NULL;

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
      AND actor_user_id IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT user_notifications_type_fields ON user_notifications IS
  'Comment types require comment/actor; collection_add stores actor_user_id (listener identity hidden in API unless actor was artist at insert).';
