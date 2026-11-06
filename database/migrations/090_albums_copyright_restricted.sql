-- Temporary admin hide of albums during copyright review (independent of is_published).

ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS copyright_restricted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS pre_copyright_is_public BOOLEAN;

COMMENT ON COLUMN albums.copyright_restricted IS
  'When true, album locale is hidden from public catalog, playback discovery, and SEO. Does not change is_published. Cleared by admin.';

COMMENT ON COLUMN albums.pre_copyright_is_public IS
  'Snapshot of is_public before admin applied copyright_restricted; used to restore artist visibility when restriction is lifted.';

CREATE INDEX IF NOT EXISTS idx_albums_copyright_restricted_true
  ON albums (copyright_restricted)
  WHERE copyright_restricted = true;
