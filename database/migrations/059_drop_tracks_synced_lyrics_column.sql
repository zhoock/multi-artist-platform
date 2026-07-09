-- Phase 6: drop legacy tracks.synced_lyrics column after migrate_legacy_track_synced_lyrics.ts
ALTER TABLE tracks DROP COLUMN IF EXISTS synced_lyrics;
