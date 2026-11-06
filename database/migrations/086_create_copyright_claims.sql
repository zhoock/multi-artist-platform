-- Copyright infringement reports (public submit → admin review).

CREATE TABLE IF NOT EXISTS copyright_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(16) NOT NULL CHECK (content_type IN ('album', 'track')),
  -- album: albums.album_id (slug); track: tracks.id::text (UUID)
  content_id VARCHAR(255) NOT NULL,
  claimant_name VARCHAR(255) NOT NULL,
  claimant_email VARCHAR(320) NOT NULL,
  claimant_type VARCHAR(40) NOT NULL CHECK (
    claimant_type IN ('copyright_owner', 'authorized_representative', 'other')
  ),
  description TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'new' CHECK (status = 'new'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copyright_claims_status_created
  ON copyright_claims (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_copyright_claims_content
  ON copyright_claims (content_type, content_id);

CREATE INDEX IF NOT EXISTS idx_copyright_claims_created_at
  ON copyright_claims (created_at DESC);

COMMENT ON TABLE copyright_claims IS 'DMCA-style copyright reports; status workflow added in later migrations.';
COMMENT ON COLUMN copyright_claims.content_id IS 'album: albums.album_id; track: tracks.id UUID as text';

CREATE OR REPLACE FUNCTION copyright_claims_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_copyright_claims_updated_at ON copyright_claims;
CREATE TRIGGER trg_copyright_claims_updated_at
  BEFORE UPDATE ON copyright_claims
  FOR EACH ROW
  EXECUTE PROCEDURE copyright_claims_set_updated_at();
