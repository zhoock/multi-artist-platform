-- System-wide admin notifications (not per-admin). Backend-only inserts via Netlify.

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(64) NOT NULL,
  title TEXT,
  body TEXT,
  target_type VARCHAR(64) NOT NULL,
  target_id UUID NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_notifications_type_known CHECK (type IN ('copyright_claim')),
  CONSTRAINT admin_notifications_target_copyright CHECK (
    (type = 'copyright_claim' AND target_type = 'copyright_claim')
    OR (type <> 'copyright_claim')
  ),
  CONSTRAINT uq_admin_notifications_type_target UNIQUE (type, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created
  ON admin_notifications (created_at DESC);

COMMENT ON TABLE admin_notifications IS
  'Platform-wide admin notifications; title/body optional — UI uses type + parsed body JSON for i18n.';

COMMENT ON COLUMN admin_notifications.body IS
  'Optional JSON string, e.g. {"contentTitle":"Album name"} for copyright_claim.';

-- PostgREST: deny direct client access (backend uses DATABASE_URL / BYPASSRLS).
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON admin_notifications FROM PUBLIC;
REVOKE ALL ON admin_notifications FROM anon;
REVOKE ALL ON admin_notifications FROM authenticated;
