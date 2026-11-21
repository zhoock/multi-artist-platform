import type { SyncedLyricsLine } from '@models';

import { LYRICS_TIMING_FILE_FORMAT, LYRICS_TIMING_FILE_VERSION } from './constants';
import { filterSyncEditorLyricLines } from './lyricLines';
import type { LyricsTimingFileV1 } from './types';

export function serializeLyricsTimingFile(
  trackTitle: string,
  lines: SyncedLyricsLine[],
  authorship: string
): LyricsTimingFileV1 {
  const lyricLines = filterSyncEditorLyricLines(lines, authorship);
  return {
    format: LYRICS_TIMING_FILE_FORMAT,
    version: LYRICS_TIMING_FILE_VERSION,
    track: {
      title: trackTitle.trim() || 'Untitled',
    },
    lyrics: lyricLines.map((line) => ({
      text: line.text,
      start: line.startTime,
      end: line.endTime as number,
    })),
  };
}
