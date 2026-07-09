export type { LyricsSyncState, ResolveLyricsSyncInput, TrackLyricsBundle } from './types';
export { trackLyricsEntityKey } from './types';

export {
  isTimedSync,
  projectLyricsBundleFields,
  resolveLyricsSyncState,
} from './resolveLyricsSyncState';

export {
  lyricsFingerprintFromContent,
  lyricsFingerprintFromSyncedLines,
  lyricsFingerprintsMatch,
} from './lyricsFingerprint';

export {
  getLyricsActionsForState,
  getLyricsPreviewLinesFromBundle,
  type LyricsAction,
} from './lyricsUiHelpers';

export { buildSyncEditorLinesFromBundle } from './syncEditorLines';
