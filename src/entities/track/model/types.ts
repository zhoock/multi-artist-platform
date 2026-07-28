/**
 * Каноническая сущность трека.
 * Lyrics, storage (`src`) и плеер согласовываются только по `id` (строка: legacy "1", UUID, …).
 * Порядок в альбоме — поле `order_index`, не позиция в массиве (массив лишь представление).
 * В БД значения с шагом 10 (10, 20, 30…) — проще вставки «между» и атомарный пересчёт при reorder.
 */
export type Track = {
  id: string;
  title: string;
  src: string;
  order_index: number;
  /** См. `TracksProps.visibility`; для данных с API / дашборда. */
  visibility?: 'public' | 'subscribers_only' | 'hidden';
  /** См. `TracksProps.stemsVisibility`; доступ к стемам в Mixer. */
  stemsVisibility?: 'public' | 'subscribers_only' | 'hidden';
  /** Публичный ответ: воспроизведение недоступно без покупки */
  playbackLocked?: boolean;
  /** Aggregate audio pipeline status (dashboard / album page). */
  processingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  /** Last pipeline failure message when processingStatus = failed. */
  processingError?: string | null;
  /** Технические характеристики аудио (извлечены при загрузке файла). */
  audioContainer?: string | null;
  audioCodec?: string | null;
  audioBitrate?: number | null;
  audioSampleRate?: number | null;
  audioBitDepth?: number | null;
  audioChannels?: number | null;
  audioDuration?: number | null;
  audioFileSize?: number | null;
};
