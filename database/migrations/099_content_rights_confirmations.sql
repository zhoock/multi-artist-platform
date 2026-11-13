-- Content rights confirmations audit trail (server-only writes via Netlify Functions).

CREATE TABLE IF NOT EXISTS content_rights_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type VARCHAR(32) NOT NULL,
  content_id TEXT NOT NULL,
  agreement_version INT NOT NULL,
  material_epoch INT NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT content_rights_confirmations_type_check CHECK (
    content_type IN (
      'album',
      'track',
      'stem',
      'article',
      'album_cover',
      'profile_avatar',
      'header_image',
      'article_image'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_content_rights_confirmations_lookup
  ON content_rights_confirmations (
    user_id,
    content_type,
    content_id,
    material_epoch DESC,
    confirmed_at DESC
  );

COMMENT ON TABLE content_rights_confirmations IS
  'Per-content rights acknowledgment at publish time. No PostgREST client access.';

ALTER TABLE content_rights_confirmations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON content_rights_confirmations FROM PUBLIC;
REVOKE ALL ON content_rights_confirmations FROM anon;
REVOKE ALL ON content_rights_confirmations FROM authenticated;

-- Material invalidation when user replaces uploaded files (not metadata-only edits).
ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS rights_material_epoch INT NOT NULL DEFAULT 0;

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS rights_material_epoch INT NOT NULL DEFAULT 0;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS rights_material_epoch INT NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rights_material_epoch INT NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS header_image_rights_epoch INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN albums.rights_material_epoch IS
  'Incremented when album cover or other album-level user material changes after publish.';
COMMENT ON COLUMN tracks.rights_material_epoch IS
  'Incremented when track audio or stem material changes.';
COMMENT ON COLUMN articles.rights_material_epoch IS
  'Incremented when published article body or cover image changes.';
COMMENT ON COLUMN users.rights_material_epoch IS
  'Incremented when profile avatar path changes.';
COMMENT ON COLUMN users.header_image_rights_epoch IS
  'Incremented when public header/hero images change.';
