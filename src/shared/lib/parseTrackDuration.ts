/**
 * Длительность трека в дашборде хранится как строка "M:SS" / "MM:SS" (см. transformEditableAlbumToAlbumData).
 * Для аудио-логики нужны секунды.
 */
export function parseTrackDurationToSeconds(
  raw: string | number | null | undefined
): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  }
  const s = String(raw).trim();
  if (!s) return undefined;
  if (!s.includes(':')) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const m = /^(\d+):(\d{1,2})$/.exec(s);
  if (!m) return undefined;
  const mins = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs < 0 || secs >= 60) {
    return undefined;
  }
  const total = mins * 60 + secs;
  return total > 0 ? total : undefined;
}
