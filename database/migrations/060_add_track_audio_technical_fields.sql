-- Технические характеристики аудиофайла, извлечённые при загрузке (ffprobe / music-metadata).
-- NULL, если формат параметр не содержит (например, MP3 без bit depth).

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS audio_container VARCHAR(32),
  ADD COLUMN IF NOT EXISTS audio_codec VARCHAR(64),
  ADD COLUMN IF NOT EXISTS audio_bitrate INTEGER,
  ADD COLUMN IF NOT EXISTS audio_sample_rate INTEGER,
  ADD COLUMN IF NOT EXISTS audio_bit_depth INTEGER,
  ADD COLUMN IF NOT EXISTS audio_channels INTEGER;

COMMENT ON COLUMN tracks.audio_container IS 'Контейнер по содержимому файла: mp3, flac, wav, aiff, aac';
COMMENT ON COLUMN tracks.audio_codec IS 'Аудиокодек (например PCM, FLAC, MPEG 1 Layer 3, AAC)';
COMMENT ON COLUMN tracks.audio_bitrate IS 'Битрейт в бит/с (NULL если неизвестен)';
COMMENT ON COLUMN tracks.audio_sample_rate IS 'Частота дискретизации в Гц (NULL если неизвестна)';
COMMENT ON COLUMN tracks.audio_bit_depth IS 'Разрядность в битах (NULL для lossy)';
COMMENT ON COLUMN tracks.audio_channels IS 'Число каналов (1=mono, 2=stereo)';
