import type { StemMeta } from '@entities/stem';

export type PersistStemsManifestFn = (
  albumId: string,
  trackId: string,
  stems: StemMeta[]
) => Promise<void>;

/**
 * Per-track serialized manifest saves. Each flush reads the latest stems snapshot
 * via `readStems` at execution time (not when scheduled).
 */
export function createStemsPersistQueue(save: PersistStemsManifestFn) {
  const chainByKey: Record<string, Promise<void>> = {};

  return function schedulePersist(
    albumId: string,
    trackId: string,
    readStems: () => StemMeta[]
  ): Promise<void> {
    const key = `${albumId}:${trackId}`;
    const flush = () => save(albumId, trackId, readStems());
    const previous = chainByKey[key] ?? Promise.resolve();
    const chained = previous.then(flush, flush);
    chainByKey[key] = chained.catch(() => undefined);
    return chained;
  };
}
