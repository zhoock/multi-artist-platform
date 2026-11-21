import type { SyncedLyricsLine } from '@models';

const normalize = (text: string) => text.trim();

export function filterSyncEditorLyricLines(
  lines: SyncedLyricsLine[],
  authorship: string
): SyncedLyricsLine[] {
  const auth = normalize(authorship);
  return lines.filter((line) => {
    const text = normalize(line.text || '');
    return text.length > 0 && (!auth || text !== auth);
  });
}

export function isValidSyncedLineTiming(startTime: number, endTime?: number): boolean {
  if (!Number.isFinite(startTime) || startTime < 0) return false;
  if (endTime === undefined || !Number.isFinite(endTime)) return false;
  return endTime > startTime;
}

export function canExportSyncedLyricTimings(
  lines: SyncedLyricsLine[],
  authorship: string
): boolean {
  const lyricLines = filterSyncEditorLyricLines(lines, authorship);
  if (lyricLines.length === 0) return false;
  return lyricLines.every((line) => isValidSyncedLineTiming(line.startTime, line.endTime));
}
