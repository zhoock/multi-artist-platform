-- Cross-process audio processing claim.
--
-- Session advisory locks are not held across statements on the Supabase
-- transaction pooler (port 6543). One conditional UPDATE of this row is the
-- mutex: the second Lambda sees the committed token and does not start ffmpeg.

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS processing_lock_token TEXT,
  ADD COLUMN IF NOT EXISTS processing_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN tracks.processing_lock_token IS
  'Owner of the in-flight audio processing claim. Released only by that owner.';

COMMENT ON COLUMN tracks.processing_locked_at IS
  'When the current claim was taken. Older than 15 minutes, it may be stolen: a Netlify background function has already stopped.';
