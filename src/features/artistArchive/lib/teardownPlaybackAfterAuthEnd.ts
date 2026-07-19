import type { AppDispatch } from '@shared/model/appStore/types';
import { playerActions } from '@features/player';
import { clearPlayerState } from '@features/player/model/lib/playerPersist';

/**
 * Локальный logout-teardown плеера без refetch каталога.
 * Иначе после clearAuth в playlist остаются premium src / isPlaying.
 */
export function teardownPlaybackAfterAuthEnd(dispatch: AppDispatch): void {
  dispatch(playerActions.pause());
  dispatch(playerActions.setPlaylist([]));
  dispatch(playerActions.setAlbumInfo(null));
  dispatch(playerActions.setSourceLocation(null));
  dispatch(playerActions.setShowLyrics(false));
  clearPlayerState();
}
