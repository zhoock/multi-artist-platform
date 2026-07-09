/** Comparable lyrics fingerprint (non-empty lines only) for sync preservation checks. */
export function lyricsFingerprintFromContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

export function lyricsFingerprintFromSyncedLines(
  lines: Array<{ text?: unknown; startTime?: unknown }>
): string {
  return lines
    .map((l) => (typeof l.text === 'string' ? l.text.trim() : ''))
    .filter((l) => l.length > 0)
    .join('\n');
}

export function lyricsFingerprintsMatch(content: string, syncedLines: unknown): boolean {
  if (!Array.isArray(syncedLines) || syncedLines.length === 0) {
    return false;
  }
  return lyricsFingerprintFromContent(content) === lyricsFingerprintFromSyncedLines(syncedLines);
}
