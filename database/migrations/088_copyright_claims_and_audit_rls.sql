-- Lock copyright_claims and admin_audit_log against PostgREST (anon/authenticated).
-- App access: Netlify Functions via DATABASE_URL (role typically BYPASSRLS).

ALTER TABLE copyright_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON copyright_claims FROM PUBLIC;
REVOKE ALL ON copyright_claims FROM anon;
REVOKE ALL ON copyright_claims FROM authenticated;

REVOKE ALL ON admin_audit_log FROM PUBLIC;
REVOKE ALL ON admin_audit_log FROM anon;
REVOKE ALL ON admin_audit_log FROM authenticated;

COMMENT ON TABLE copyright_claims IS
  'DMCA-style copyright reports. RLS enabled with no policies: PostgREST roles denied; backend uses DATABASE_URL.';

COMMENT ON TABLE admin_audit_log IS
  'Platform admin audit log. RLS enabled with no policies: PostgREST roles denied; backend uses DATABASE_URL.';
