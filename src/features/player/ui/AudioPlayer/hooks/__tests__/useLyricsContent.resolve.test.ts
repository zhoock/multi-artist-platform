import { describe, expect, it } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { resolveTrackLyricsBundle } from '@entities/lyrics/lib/selectors';
import { applyTrackLyricsBundle } from '@entities/lyrics/model/actions';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { initialPlayerState, type PlayerTrack } from '@features/player/model/types/playerSchema';
import type { RootState } from '@shared/model/appStore/types';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

const syncedBundle: TrackLyricsBundle = {
  albumId: 'album-1',
  trackId: 'track-1',
  lang: 'ru',
  content: 'Hello',
  authorship: 'Author',
  syncedLines: [{ text: 'Hello', startTime: 1 }],
  state: 'synced',
  syncedAt: '2026-01-01T00:00:00.000Z',
};

const textOnlyBundle: TrackLyricsBundle = {
  ...syncedBundle,
  syncedLines: null,
  state: 'text-only',
  syncedAt: null,
};

const thinTrack: PlayerTrack = {
  id: 'track-1',
  albumId: 'album-1',
  title: 'Song',
  duration: 180,
  src: '',
};

function createPlayerStore(playlistTrack: PlayerTrack) {
  return configureStore({
    reducer: {
      trackLyrics: trackLyricsReducer,
      player: playerReducer,
    },
    preloadedState: {
      trackLyrics: { entities: {} },
      player: {
        ...initialPlayerState,
        playlist: [playlistTrack],
        originalPlaylist: [playlistTrack],
        albumId: 'album-1',
        albumTitle: 'Test Album',
        albumMeta: {
          albumId: 'album-1',
          album: 'Test Album',
          artist: 'Artist',
          fullName: 'Artist',
          cover: null,
        },
      },
    },
  });
}

/**
 * Mirrors useLyricsContent: lyrics come only from trackLyricsSlice (no playlist embed).
 */
function resolvePlayerLyricsBundle(
  state: RootState,
  track: PlayerTrack,
  albumIdFallback: string
): TrackLyricsBundle | null {
  const canonicalAlbumId =
    track.albumId?.trim() ||
    state.player.albumMeta?.albumId?.trim() ||
    state.player.albumId?.trim() ||
    albumIdFallback;

  return resolveTrackLyricsBundle(state, canonicalAlbumId, track.id, null);
}

describe('player lyrics resolution', () => {
  it('resolves lyrics from trackLyricsSlice for thin PlayerTrack', () => {
    const store = createPlayerStore(thinTrack);
    store.dispatch(applyTrackLyricsBundle(textOnlyBundle));

    const resolved = resolvePlayerLyricsBundle(
      store.getState() as unknown as RootState,
      thinTrack,
      'album-1'
    );

    expect(resolved?.state).toBe('text-only');
    expect(resolved?.syncedLines).toBeNull();
  });

  it('returns empty when slice has no lyrics (playlist no longer embeds lyrics)', () => {
    const store = createPlayerStore(thinTrack);
    const resolved = resolvePlayerLyricsBundle(
      store.getState() as unknown as RootState,
      thinTrack,
      'album-1'
    );

    expect(resolved?.state).toBe('empty');
  });

  it('resolves via albumMeta.albumId when track.albumId is missing', () => {
    const trackWithoutAlbum: PlayerTrack = {
      id: 'track-1',
      title: 'Song',
      duration: 180,
      src: '',
    };

    const store = createPlayerStore(trackWithoutAlbum);
    store.dispatch(applyTrackLyricsBundle(syncedBundle));

    const resolved = resolvePlayerLyricsBundle(
      store.getState() as unknown as RootState,
      trackWithoutAlbum,
      'wrong-album'
    );

    expect(resolved?.state).toBe('synced');
    expect(resolved?.albumId).toBe('album-1');
  });
});
