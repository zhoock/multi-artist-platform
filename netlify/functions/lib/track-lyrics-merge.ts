import type { TrackLyricsBundle } from '../../../src/shared/lib/lyrics/types';

/** Merge lyrics bundles across locale payloads (ru-first timed sync). */
export function mergeTrackLyricsBundles(bundles: TrackLyricsBundle[]): TrackLyricsBundle {
  if (bundles.length === 0) {
    throw new Error('mergeTrackLyricsBundles: empty');
  }
  const synced = bundles.find((b) => b.state === 'synced');
  if (synced) return synced;
  const withText = bundles.find((b) => b.content.trim());
  return withText ?? bundles[0];
}
