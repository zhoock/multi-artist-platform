-- Audio Asset Pipeline: master path + processing state on tracks; derived outputs in track_assets.

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS master_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS processing_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tracks_processing_status_check'
  ) THEN
    ALTER TABLE tracks
      ADD CONSTRAINT tracks_processing_status_check
      CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'));
  END IF;
END $$;

COMMENT ON COLUMN tracks.master_path IS 'Supabase storage path or public URL of immutable master upload (original/)';
COMMENT ON COLUMN tracks.processing_status IS 'Playback readiness for dashboard UX: ready when playback-required derived assets are ready';
COMMENT ON COLUMN tracks.processing_error IS 'Last playback-required pipeline failure when processing_status = failed';

CREATE TABLE IF NOT EXISTS track_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id          UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  type              VARCHAR(32) NOT NULL,
  format            VARCHAR(32) NOT NULL,
  variant           VARCHAR(32) NOT NULL DEFAULT 'default',
  generator         VARCHAR(64) NOT NULL,
  generator_version INTEGER NOT NULL DEFAULT 1,
  status            VARCHAR(16) NOT NULL DEFAULT 'pending',
  path              VARCHAR(500),
  metadata          JSONB NOT NULL DEFAULT '{}',
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (track_id, type, format, variant),
  CHECK (status IN ('pending', 'processing', 'ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_track_assets_track_id
  ON track_assets(track_id);

CREATE INDEX IF NOT EXISTS idx_track_assets_ready_streams
  ON track_assets(track_id, type, format, variant)
  WHERE type = 'stream' AND status = 'ready';

CREATE INDEX IF NOT EXISTS idx_track_assets_stale
  ON track_assets(generator, generator_version)
  WHERE status = 'ready';

COMMENT ON TABLE track_assets IS 'Derived outputs per track (streams, waveforms, previews, etc.)';
COMMENT ON COLUMN track_assets.type IS 'Asset kind: stream, preview, waveform, spectrogram, loudness, …';
COMMENT ON COLUMN track_assets.format IS 'Container/encoding: opus, aac, json, webp, …';
COMMENT ON COLUMN track_assets.variant IS 'Variant label: 128k, 256k, 30s, default, …';
COMMENT ON COLUMN track_assets.generator IS 'Pipeline generator id: ffmpeg-opus, waveform, loudness, …';
COMMENT ON COLUMN track_assets.generator_version IS 'Version of generator algorithm, compared to GENERATOR_VERSIONS in app config';
COMMENT ON COLUMN track_assets.path IS 'Supabase storage path under derived/';
COMMENT ON COLUMN track_assets.metadata IS 'Type-specific JSON metadata (bitrate, sampleRate, pointCount, …)';
