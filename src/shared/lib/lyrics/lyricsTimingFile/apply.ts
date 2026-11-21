import type { SyncedLyricsLine } from '@models';

import { filterSyncEditorLyricLines } from './lyricLines';
import type { LyricsTimingFileLine } from './types';

const normalize = (text: string) => text.trim();

export function applyImportedLyricsTimingsToEditor(
  lines: SyncedLyricsLine[],
  authorship: string,
  imported: LyricsTimingFileLine[]
): SyncedLyricsLine[] {
  let importIndex = 0;
  const auth = normalize(authorship);

  return lines.map((line) => {
    const text = normalize(line.text || '');
    if (!text.length || (auth && text === auth)) {
      return line;
    }
    const next = imported[importIndex];
    if (!next || normalize(next.text) !== text) {
      return line;
    }
    importIndex += 1;
    return {
      ...line,
      startTime: next.start,
      endTime: next.end,
    };
  });
}

export function collectEditorLyricLineTexts(
  lines: SyncedLyricsLine[],
  authorship: string
): string[] {
  return filterSyncEditorLyricLines(lines, authorship).map((line) => line.text);
}
