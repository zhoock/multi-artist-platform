import { describe, expect, it } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { albumsReducer } from '@entities/album/model/albumsSlice';
import { createAlbumsTestState } from '@entities/album/model/__tests__/albumsTestState';
import { applyTrackLyricsBundle } from '@entities/lyrics/model/actions';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import { trackLyricsEntityKey } from '@shared/lib/lyrics/types';
import type { AlbumEditable } from '@models';

const bundle: TrackLyricsBundle = {
  albumId: 'album-1',
  trackId: 'track-1',
  lang: 'en',
  content: 'Hello world',
  authorship: 'Author',
  syncedLines: [{ text: 'Hello world', startTime: 1.5 }],
  state: 'synced',
  syncedAt: '2026-01-01T00:00:00.000Z',
};

describe('applyTrackLyricsBundle', () => {
  it('updates trackLyrics entity and albums dashboard track lyrics atomically', () => {
    const store = configureStore({
      reducer: {
        trackLyrics: trackLyricsReducer,
        albums: albumsReducer,
      },
      preloadedState: {
        albums: createAlbumsTestState({
          dashboard: {
            status: 'succeeded',
            error: null,
            lastUpdated: null,
            inFlightFetchContextKey: null,
            data: [
              {
                albumId: 'album-1',
                artistDisplayName: 'Artist',
                album: 'Album',
                fullName: 'Artist — Album',
                description: '',
                release: {},
                buttons: {},
                details: [],
                tracks: [
                  {
                    id: 'track-1',
                    title: 'Track',
                    order_index: 0,
                    duration: 0,
                    src: '',
                    content: '',
                    lyrics: {
                      albumId: 'album-1',
                      trackId: 'track-1',
                      lang: 'en',
                      content: '',
                      syncedLines: null,
                      state: 'empty',
                      syncedAt: null,
                    },
                  },
                ],
              } satisfies AlbumEditable,
            ],
          },
        }),
      },
    });

    store.dispatch(applyTrackLyricsBundle(bundle));

    const state = store.getState();
    expect(state.trackLyrics.entities[trackLyricsEntityKey('album-1', 'track-1', 'en')]).toEqual(
      bundle
    );
    expect(state.albums.dashboard.data[0]?.tracks[0]?.lyrics).toEqual(bundle);
    expect(state.albums.dashboard.data[0]?.tracks[0]?.content).toBe('Hello world');
  });
});
