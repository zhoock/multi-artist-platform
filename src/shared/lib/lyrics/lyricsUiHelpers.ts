import type { TrackLyricsBundle } from './types';

export type LyricsAction = 'edit' | 'prev' | 'sync' | 'add';

export function getLyricsActionsForState(state: TrackLyricsBundle['state']): LyricsAction[] {
  switch (state) {
    case 'synced':
      return ['edit', 'prev', 'sync'];
    case 'text-only':
      return ['edit', 'sync'];
    case 'empty':
      return ['add'];
    default:
      return [];
  }
}

export function getLyricsPreviewLinesFromBundle(
  bundle: TrackLyricsBundle,
  maxLines: number = 3
): string[] {
  const source =
    bundle.state === 'synced' && bundle.syncedLines?.length
      ? bundle.syncedLines.map((line) => line.text.trim())
      : bundle.content
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

  return source.filter(Boolean).slice(0, maxLines);
}
