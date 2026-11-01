-- Audience analytics: qualified_track_plays (082 + 083)
-- Safe to run once on production. Idempotent parts: CREATE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- 083 requires table from 082. Re-running 083 REVOKE/ENABLE RLS is safe.
-- Manual apply only — not picked up by scripts/migrate-database.ts

-- ========== 082_create_qualified_track_plays.sql ==========

CREATE TABLE IF NOT EXISTS qualified_track_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  listener_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  listener_anon_id UUID,
  playback_session_id UUID NOT NULL,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_listened_seconds INTEGER NOT NULL CHECK (duration_listened_seconds > 0),

  CONSTRAINT qualified_track_plays_listener_identity_check CHECK (
    (listener_user_id IS NOT NULL AND listener_anon_id IS NULL)
    OR (listener_user_id IS NULL AND listener_anon_id IS NOT NULL)
  ),

  CONSTRAINT qualified_track_plays_session_track_unique
    UNIQUE (playback_session_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_qualified_track_plays_artist_played_at
  ON qualified_track_plays (artist_user_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_qualified_track_plays_artist_listener_user
  ON qualified_track_plays (artist_user_id, listener_user_id)
  WHERE listener_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qualified_track_plays_artist_listener_anon
  ON qualified_track_plays (artist_user_id, listener_anon_id)
  WHERE listener_anon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qualified_track_plays_track_played_at
  ON qualified_track_plays (track_id, played_at DESC);

COMMENT ON TABLE qualified_track_plays IS
  'Qualified listens (30s or 50% for short tracks) for artist audience metrics';
COMMENT ON COLUMN qualified_track_plays.playback_session_id IS
  'Client-generated id for a single playback launch, dedupes qualified events';

-- ========== 083_harden_qualified_track_plays_rls.sql ==========

ALTER TABLE qualified_track_plays ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON qualified_track_plays FROM PUBLIC;
REVOKE ALL ON qualified_track_plays FROM anon;
REVOKE ALL ON qualified_track_plays FROM authenticated;

COMMENT ON TABLE qualified_track_plays IS
  'Qualified listens for artist audience metrics. RLS enabled with no policies: PostgREST roles denied; backend uses DATABASE_URL.';
