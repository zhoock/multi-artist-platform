-- Evidence attachments for public copyright claims (storage metadata only; bytes in Supabase Storage).

ALTER TABLE copyright_claims
  ADD COLUMN IF NOT EXISTS attachment_upload_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS attachment_upload_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS copyright_claim_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES copyright_claims(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  upload_status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (upload_status IN ('pending', 'uploaded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ,
  CONSTRAINT copyright_claim_attachments_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_copyright_claim_attachments_claim
  ON copyright_claim_attachments (claim_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_copyright_claim_attachments_pending_created
  ON copyright_claim_attachments (upload_status, created_at)
  WHERE upload_status = 'pending';

ALTER TABLE copyright_claim_attachments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON copyright_claim_attachments FROM PUBLIC;
REVOKE ALL ON copyright_claim_attachments FROM anon;
REVOKE ALL ON copyright_claim_attachments FROM authenticated;

COMMENT ON TABLE copyright_claim_attachments IS
  'Private evidence files for copyright_claims. Paths under copyright-claims/{claimId}/{attachmentId}/. Access via service role only. Stale upload_status=pending rows older than COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS are removed by scheduled-copyright-attachments-cleanup.';

COMMENT ON COLUMN copyright_claims.attachment_upload_token_hash IS
  'SHA-256 hex of one-time upload token returned to claimant after POST; required for attachment presign/complete.';