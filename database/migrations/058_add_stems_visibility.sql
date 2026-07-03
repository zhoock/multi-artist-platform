-- Уровень доступа к стемам трека в публичном Mixer (независимо от tracks.visibility).
-- public — все; subscribers_only — только подписчики; hidden — не показывать в Mixer.

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS stems_visibility VARCHAR(24) NOT NULL DEFAULT 'public';

ALTER TABLE tracks DROP CONSTRAINT IF EXISTS tracks_stems_visibility_check;

ALTER TABLE tracks
  ADD CONSTRAINT tracks_stems_visibility_check
  CHECK (stems_visibility IN ('public', 'subscribers_only', 'hidden'));

CREATE INDEX IF NOT EXISTS idx_tracks_stems_visibility ON tracks (stems_visibility);

COMMENT ON COLUMN tracks.stems_visibility IS 'Доступ к стемам в Mixer: public | subscribers_only | hidden';
