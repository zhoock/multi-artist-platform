import type { AppDispatch, RootState } from '@shared/model/appStore/types';
import type { SupportedLang } from '@shared/model/lang';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';

import { ensureTrackLyricsBundle } from './ensureTrackLyricsBundle';

export function resolveAlbumIdForTrackLyrics(track: PlayerTrack, state: RootState): string {
  return (
    track.albumId?.trim() ||
    track.queueAlbumMeta?.albumId?.trim() ||
    state.player.albumMeta?.albumId?.trim() ||
    ''
  );
}

/** Fire-and-forget lyrics fetch for the current playlist row (logical track id). */
export function prefetchLyricsForPlayerTrack(
  dispatch: AppDispatch,
  getState: () => RootState
): void {
  const state = getState();
  const track = state.player.playlist[state.player.currentTrackIndex];
  if (!track) {
    return;
  }

  const albumId = resolveAlbumIdForTrackLyrics(track, state);
  if (!albumId) {
    return;
  }

  void ensureTrackLyricsBundle(dispatch, getState, {
    albumId,
    trackId: track.id,
    lang: state.lang.current,
    artistSlug: state.player.albumMeta?.publicSlug,
    persistEmpty: false,
  });
}
