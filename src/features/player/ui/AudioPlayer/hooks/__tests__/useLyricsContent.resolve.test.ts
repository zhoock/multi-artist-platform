import { describe, expect, it } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { resolveTrackLyricsBundle } from '@entities/lyrics/lib/selectors';
import { applyTrackLyricsBundle } from '@entities/lyrics/model/actions';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { playerReducer } from '@features/player/model/slice/playerSlice';
import { initialPlayerState } from '@features/player/model/types/playerSchema';
import type { RootState } from '@shared/model/appStore/types';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import type { TracksProps } from '@models';

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

function createPlayerStore(playlistTrack: TracksProps) {
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
 * Mirrors the player resolution path in useLyricsContent:
 * prefer trackLyricsSlice, fall back to playlist-embedded lyrics only for hydration.
 */
function resolvePlayerLyricsBundle(
  state: RootState,
  track: TracksProps,
  albumIdFallback: string
): TrackLyricsBundle {
  const canonicalAlbumId =
    track.lyrics?.albumId?.trim() ||
    state.player.albumMeta?.albumId?.trim() ||
    state.player.albumId?.trim() ||
    albumIdFallback;

  return resolveTrackLyricsBundle(state, canonicalAlbumId, track.id, track.lyrics);
}

describe('player lyrics resolution', () => {
  it('prefers trackLyricsSlice over stale playlist-embedded lyrics', () => {
    const track: TracksProps = {
      id: 'track-1',
      title: 'Song',
      order_index: 0,
      duration: 180,
      src: '',
      content: 'Hello',
      lyrics: syncedBundle,
    };

    const store = createPlayerStore(track);
    store.dispatch(applyTrackLyricsBundle(textOnlyBundle));

    const resolved = resolvePlayerLyricsBundle(
      store.getState() as unknown as RootState,
      track,
      'album-1'
    );

    expect(resolved.state).toBe('text-only');
    expect(resolved.syncedLines).toBeNull();
  });

  it('uses playlist-embedded lyrics as hydration fallback before slice is populated', () => {
    const track: TracksProps = {
      id: 'track-1',
      title: 'Song',
      order_index: 0,
      duration: 180,
      src: '',
      content: 'Hello',
      lyrics: syncedBundle,
    };

    const store = createPlayerStore(track);
    const resolved = resolvePlayerLyricsBundle(
      store.getState() as unknown as RootState,
      track,
      'album-1'
    );

    expect(resolved.state).toBe('synced');
    expect(resolved).toEqual(syncedBundle);
  });

  it('resolves via albumMeta.albumId when playlist lyrics albumId is missing', () => {
    const track: TracksProps = {
      id: 'track-1',
      title: 'Song',
      order_index: 0,
      duration: 180,
      src: '',
      content: 'Hello',
    };

    const store = createPlayerStore(track);
    store.dispatch(applyTrackLyricsBundle(syncedBundle));

    const resolved = resolvePlayerLyricsBundle(
      store.getState() as unknown as RootState,
      track,
      'wrong-album'
    );

    expect(resolved.state).toBe('synced');
    expect(resolved.albumId).toBe('album-1');
  });
});
