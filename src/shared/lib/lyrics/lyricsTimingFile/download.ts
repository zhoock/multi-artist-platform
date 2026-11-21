import type { LyricsTimingFileV1 } from './types';

export function triggerLyricsTimingFileDownload(
  filename: string,
  payload: LyricsTimingFileV1
): void {
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}
