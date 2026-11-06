-- Copyright claims workflow: statuses, admin_note, audit log.

-- Relax status constraint to full workflow
ALTER TABLE copyright_claims DROP CONSTRAINT IF EXISTS copyright_claims_status_check;
ALTER TABLE copyright_claims
  ADD CONSTRAINT copyright_claims_status_check
  CHECK (status IN ('new', 'under_review', 'resolved', 'rejected'));

ALTER TABLE copyright_claims
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

COMMENT ON COLUMN copyright_claims.admin_note IS 'Internal admin note; never exposed to public API.';

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id UUID NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON admin_audit_log (target_type, target_id, created_at DESC);

COMMENT ON TABLE admin_audit_log IS 'Platform admin actions (copyright claims, etc.).';
COMMENT ON COLUMN admin_audit_log.admin_user_id IS 'NULL for system events (e.g. public claim submitted).';
