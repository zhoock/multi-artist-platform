import type { SyncedLyricsLine } from '@models';

import type { TrackLyricsBundle } from './types';

const normalize = (text: string) => text.trim();

function syncLineMatchesContentText(stored: SyncedLyricsLine, contentText: string): boolean {
  return normalize(stored.text || '') === normalize(contentText);
}

/** Build sync-editor lines from canonical bundle + optional dashboard fallback text. */
export function buildSyncEditorLinesFromBundle(
  bundle: TrackLyricsBundle,
  fallbackText?: string
): { lines: SyncedLyricsLine[]; authorship: string } {
  const content = (bundle.content.trim() || fallbackText?.trim() || '').replace(/\r\n/g, '\n');
  const authorship = bundle.authorship?.trim() || '';
  const contentLines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (contentLines.length === 0) {
    return { lines: [], authorship };
  }

  const syncedByIndex =
    bundle.state === 'synced' && bundle.syncedLines?.length ? bundle.syncedLines : null;

  const lines = contentLines.map((text, index) => {
    const stored = syncedByIndex?.[index];
    if (stored && syncLineMatchesContentText(stored, text)) {
      return {
        text,
        startTime: stored.startTime,
        endTime: stored.endTime,
      };
    }
    return { text, startTime: 0, endTime: undefined };
  });

  return { lines, authorship };
}
