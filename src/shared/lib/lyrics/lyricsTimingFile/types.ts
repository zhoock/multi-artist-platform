import type { LYRICS_TIMING_FILE_FORMAT } from './constants';

export type LyricsTimingFileLine = {
  text: string;
  start: number;
  end: number;
};

export type LyricsTimingFileV1 = {
  format: typeof LYRICS_TIMING_FILE_FORMAT;
  version: 1;
  track: {
    title: string;
  };
  lyrics: LyricsTimingFileLine[];
};

export type LyricsTimingImportErrorCode =
  | 'invalid-json'
  | 'unsupported-format'
  | 'unsupported-version'
  | 'invalid-structure'
  | 'invalid-timings'
  | 'line-count-mismatch'
  | 'text-mismatch';

export class LyricsTimingImportError extends Error {
  readonly code: LyricsTimingImportErrorCode;

  constructor(code: LyricsTimingImportErrorCode) {
    super(code);
    this.code = code;
    this.name = 'LyricsTimingImportError';
  }
}
