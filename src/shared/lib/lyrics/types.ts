import type { SyncedLyricsLine } from '@models';

export type LyricsSyncState = 'empty' | 'text-only' | 'synced';

export interface TrackLyricsBundle {
  albumId: string;
  trackId: string;
  /** Canonical storage lang (ru-priority album rule). */
  lang: string;
  content: string;
  authorship?: string;
  /** Timed lines; null unless state === 'synced'. */
  syncedLines: SyncedLyricsLine[] | null;
  state: LyricsSyncState;
  syncedAt: string | null;
}

export interface ResolveLyricsSyncInput {
  content?: string | null;
  syncedLines?: SyncedLyricsLine[] | null;
}

export function trackLyricsEntityKey(
  albumId: string,
  trackId: string | number,
  lang: string
): string {
  return `${albumId}:${String(trackId)}:${lang}`;
}
