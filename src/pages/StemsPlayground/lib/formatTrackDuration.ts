// src/pages/StemsPlayground/lib/formatTrackDuration.ts

/** Форматирует длительность (секунды) в `m:ss`; для невалидных значений — `--:--`. */
export function formatTrackDuration(duration?: number | null): string {
  if (duration == null || !Number.isFinite(duration) || duration < 0) {
    return '--:--';
  }
  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
