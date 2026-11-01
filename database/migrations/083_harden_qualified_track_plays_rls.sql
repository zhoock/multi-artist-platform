-- Harden qualified_track_plays against Supabase PostgREST (anon/authenticated).
-- App access: Netlify Functions via DATABASE_URL (PostgreSQL role, typically BYPASSRLS).
-- Backend access via DATABASE_URL only (no extra table grants in this migration).

ALTER TABLE qualified_track_plays ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON qualified_track_plays FROM PUBLIC;
REVOKE ALL ON qualified_track_plays FROM anon;
REVOKE ALL ON qualified_track_plays FROM authenticated;

COMMENT ON TABLE qualified_track_plays IS
  'Qualified listens for artist audience metrics. RLS enabled with no policies: PostgREST roles denied; backend uses DATABASE_URL.';
