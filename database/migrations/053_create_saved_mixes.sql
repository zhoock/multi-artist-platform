-- Saved Mixes: пользовательские пресеты микшера публичной страницы /stems.
-- Хранится только конфигурация стемов (volume/muted/solo), без аудиофайлов.
-- Любой микс шарится по ссылке /stems/mix/:id (read-only пресет).

CREATE TABLE IF NOT EXISTS saved_mixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_mixes_user_id ON saved_mixes (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_mixes_id ON saved_mixes (id);

CREATE TRIGGER update_saved_mixes_updated_at
  BEFORE UPDATE ON saved_mixes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE saved_mixes IS 'Сохранённые миксы (пресеты микшера) пользователей публичной страницы /stems';
COMMENT ON COLUMN saved_mixes.user_id IS 'Владелец микса';
COMMENT ON COLUMN saved_mixes.artist_user_id IS 'Артист (владелец альбома), чтобы shared-ссылка открыла нужный каталог';
COMMENT ON COLUMN saved_mixes.album_id IS 'Storage album_id трека';
COMMENT ON COLUMN saved_mixes.track_id IS 'Storage track_id';
COMMENT ON COLUMN saved_mixes.settings IS 'Массив { stemId, volume, muted, solo } — без аудио';
