/**
 * Keeps the player queue in sync with the public album-details payload, which is the source of
 * truth for which tracks still exist and are publicly available (deleted, hidden, or failed
 * playback rows are absent from it; a 404 means the album itself is gone for this viewer).
 */

import type { AppDispatch, RootState } from '@shared/model/appStore/types';
import type { FetchAlbumDetailsPageResult } from '@entities/album/model/albumDetailsSlice';
import type { PlayerState } from '@features/player/model/types/playerSchema';
import { playerActions } from '@features/player/model/slice/playerSlice';

export type PlayerQueueAvailabilityUpdate = {
  albumIds: string[];
  availableTrackIds: string[];
};

export type AlbumDetailsOutcome = Pick<
  FetchAlbumDetailsPageResult,
  'album' | 'artistSlug' | 'albumId' | 'notFound' | 'errorCode' | 'staleAbort'
>;

function sameSlug(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  return Boolean(left) && left === right;
}

/**
 * Album slugs are only unique per artist, so the result must be proven to belong to the
 * player's artist (userId or public slug) before it may prune the queue.
 */
export function resolvePlayerQueueAvailabilityUpdate(
  player: Pick<PlayerState, 'albumId' | 'albumMeta' | 'playlist'>,
  outcome: AlbumDetailsOutcome
): PlayerQueueAvailabilityUpdate | null {
  if (outcome.staleAbort || player.playlist.length === 0) return null;

  const playerAlbumId = (player.albumMeta?.albumId ?? player.albumId ?? '').trim();
  if (!playerAlbumId) return null;

  const playerUserId = player.albumMeta?.userId?.trim() || '';
  const playerSlug = player.albumMeta?.publicSlug?.trim() || '';

  const album = outcome.album;
  if (album) {
    const albumIds = [album.albumId, album.slug].filter(Boolean);
    if (!albumIds.includes(playerAlbumId)) return null;
    const sameArtist = playerUserId
      ? playerUserId === album.userId
      : sameSlug(playerSlug, outcome.artistSlug);
    if (!sameArtist) return null;
    return { albumIds, availableTrackIds: album.tracks.map((track) => track.id) };
  }

  if (!outcome.notFound || outcome.errorCode === 'MISSING_PARAMS') return null;
  if (outcome.albumId.trim() !== playerAlbumId) return null;
  if (!sameSlug(playerSlug, outcome.artistSlug)) return null;
  return { albumIds: [playerAlbumId], availableTrackIds: [] };
}

export function applyPlayerQueueAvailability(
  dispatch: AppDispatch,
  getState: () => RootState,
  outcome: AlbumDetailsOutcome
): void {
  const update = resolvePlayerQueueAvailabilityUpdate(getState().player, outcome);
  if (update) {
    dispatch(playerActions.removeUnavailableTracks(update));
  }
}
