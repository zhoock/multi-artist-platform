import { getStore } from '@shared/model/appStore';

import type { ArtistCardPlayPlayerSnapshot } from './artistCardPlayButtonPhase';

/**
 * Player snapshot for Universe artist-card Play/Pause UI.
 * Reads Redux at call time so imperative card DOM stays aligned with the mini player.
 */
export function buildArtistCardPlayPlayerSnapshot(
  startingArtistSlug: string | null
): ArtistCardPlayPlayerSnapshot {
  const player = getStore().getState().player;
  return {
    startingArtistSlug,
    activeArtistSlug: player.albumMeta?.publicSlug?.trim() ?? null,
    isPlaying: player.isPlaying,
    hasActiveQueue: player.playlist.length > 0,
  };
}
