-- Album page comments (roots + one level of replies). App access via Netlify Functions (DATABASE_URL).

CREATE TABLE IF NOT EXISTS album_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES album_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT album_comments_body_length CHECK (char_length(body) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_album_comments_album_roots
  ON album_comments (artist_user_id, album_id, created_at DESC)
  WHERE parent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_album_comments_parent
  ON album_comments (parent_id, created_at ASC)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_album_comments_active_album
  ON album_comments (artist_user_id, album_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER update_album_comments_updated_at
  BEFORE UPDATE ON album_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN album_comments.artist_user_id IS 'Owner of the album (moderation scope)';
COMMENT ON COLUMN album_comments.album_id IS 'Public albums.album_id slug';
COMMENT ON COLUMN album_comments.parent_id IS 'NULL for root comment; otherwise UUID of root comment';

CREATE TABLE IF NOT EXISTS album_comment_likes (
  comment_id UUID NOT NULL REFERENCES album_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_album_comment_likes_comment
  ON album_comment_likes (comment_id);


CREATE TABLE IF NOT EXISTS album_comment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES album_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_album_comment_reports_comment
  ON album_comment_reports (comment_id);

ALTER TABLE album_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_comment_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON album_comments FROM PUBLIC;
REVOKE ALL ON album_comments FROM anon;
REVOKE ALL ON album_comments FROM authenticated;

REVOKE ALL ON album_comment_likes FROM PUBLIC;
REVOKE ALL ON album_comment_likes FROM anon;
REVOKE ALL ON album_comment_likes FROM authenticated;

REVOKE ALL ON album_comment_reports FROM PUBLIC;
REVOKE ALL ON album_comment_reports FROM anon;
REVOKE ALL ON album_comment_reports FROM authenticated;

COMMENT ON TABLE album_comments IS
  'Album page comments. RLS enabled with no policies: PostgREST roles denied; backend uses DATABASE_URL.';
COMMENT ON TABLE album_comment_likes IS
  'Album comment likes. RLS enabled with no policies: PostgREST roles denied; backend uses DATABASE_URL.';
COMMENT ON TABLE album_comment_reports IS
  'Album comment reports. RLS enabled with no policies: PostgREST roles denied; backend uses DATABASE_URL.';
