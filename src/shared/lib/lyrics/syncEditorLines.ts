import type { SyncedLyricsLine } from '@models';

import type { TrackLyricsBundle } from './types';

const normalize = (text: string) => text.trim();

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

  const syncByNormalizedText = new Map<string, SyncedLyricsLine>();
  if (bundle.state === 'synced' && bundle.syncedLines?.length) {
    for (const line of bundle.syncedLines) {
      const key = normalize(line.text || '');
      if (key && !syncByNormalizedText.has(key)) {
        syncByNormalizedText.set(key, line);
      }
    }
  }

  const lines = contentLines.map((text) => {
    const stored = syncByNormalizedText.get(normalize(text));
    return stored ?? { text, startTime: 0, endTime: undefined };
  });

  return { lines, authorship };
}
