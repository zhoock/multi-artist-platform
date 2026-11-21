export function buildLyricsTimingDownloadFilename(trackTitle: string): string {
  const trimmed = trackTitle.trim() || 'track';
  const safe = trimmed
    .replace(/[^\p{L}\p{N}\s\-_]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${safe || 'track'}.timings.json`;
}
