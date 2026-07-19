-- Длительность (из probe) и размер файла в байтах — для карточки покупки, админки и лимитов.
-- Без точки с запятой внутри COMMENT (мигратор режет SQL по ';').

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS audio_duration DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS audio_file_size BIGINT;

COMMENT ON COLUMN tracks.audio_duration IS 'Длительность аудио в секундах из probe при загрузке (NULL если неизвестна)';
COMMENT ON COLUMN tracks.audio_file_size IS 'Размер исходного аудиофайла в байтах (NULL если неизвестен)';
