-- Наличие стемов у трека (денормализация Storage stems.json для thin CatalogAlbum / Mixer).
-- Источник истины файлов — Storage; колонка поддерживается при save/delete манифеста
-- и одноразовом backfill (scripts/backfill-tracks-has-stems.ts).

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS has_stems BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tracks_has_stems ON tracks (has_stems)
  WHERE has_stems = true;

COMMENT ON COLUMN tracks.has_stems IS
  'true, если у трека в Storage есть непустой stems.json (публичный Mixer / CatalogAlbum.hasStems)';
