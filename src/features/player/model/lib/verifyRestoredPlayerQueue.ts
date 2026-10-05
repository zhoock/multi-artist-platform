/**
 * Cold restore from localStorage: the persisted queue may reference tracks that disappeared
 * since the last visit. Kept out of playerListeners' import graph — the fetch module reaches
 * appStore through auth, which would make the store import itself during init.
 */

import type { AppDispatch, RootState } from '@shared/model/appStore/types';
import { AlbumDetailsFetchError, fetchAlbumDetails } from '@entities/album/api/fetchAlbumDetails';
import { applyPlayerQueueAvailability } from '@features/player/model/lib/playerQueueAvailability';

/** Network / 5xx failures keep the queue untouched; only a definitive answer prunes it. */
export async function verifyRestoredPlayerQueue(
  dispatch: AppDispatch,
  getState: () => RootState
): Promise<void> {
  const { player } = getState();
  const albumId = (player.albumMeta?.albumId ?? player.albumId ?? '').trim();
  const artistSlug = player.albumMeta?.publicSlug?.trim() || '';
  if (!albumId || !artistSlug || player.playlist.length === 0) return;

  try {
    const album = await fetchAlbumDetails(artistSlug, albumId);
    applyPlayerQueueAvailability(dispatch, getState, { album, artistSlug, albumId });
  } catch (error) {
    if (error instanceof AlbumDetailsFetchError && error.status === 404) {
      applyPlayerQueueAvailability(dispatch, getState, {
        album: null,
        artistSlug,
        albumId,
        notFound: true,
        errorCode: error.code ?? 'ALBUM_NOT_FOUND',
      });
    }
  }
}
