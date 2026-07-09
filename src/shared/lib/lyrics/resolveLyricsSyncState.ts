import type { SyncedLyricsLine } from '@models';

import type { LyricsSyncState, ResolveLyricsSyncInput } from './types';

export function isTimedSync(lines: SyncedLyricsLine[] | null | undefined): boolean {
  return Array.isArray(lines) && lines.some((line) => (line.startTime ?? 0) > 0);
}

export function resolveLyricsSyncState(input: ResolveLyricsSyncInput): LyricsSyncState {
  const syncedLines = input.syncedLines ?? null;
  if (isTimedSync(syncedLines)) {
    return 'synced';
  }

  const hasText = Boolean(input.content?.trim());
  if (hasText) {
    return 'text-only';
  }

  return 'empty';
}

/** Build bundle fields from raw DB/API inputs (state + syncedLines projection). */
export function projectLyricsBundleFields(input: ResolveLyricsSyncInput): {
  state: LyricsSyncState;
  syncedLines: SyncedLyricsLine[] | null;
} {
  const state = resolveLyricsSyncState(input);
  const syncedLines = state === 'synced' && input.syncedLines ? input.syncedLines : null;
  return { state, syncedLines };
}
