import { describe, expect, it } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { resolveTrackLyricsBundle } from '@entities/lyrics/lib/selectors';
import { applyTrackLyricsBundle } from '@entities/lyrics/model/actions';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import type { RootState } from '@shared/model/appStore/types';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

const syncedBundle: TrackLyricsBundle = {
  albumId: 'album-1',
  trackId: 'track-1',
  lang: 'ru',
  content: 'Привет',
  authorship: 'Author',
  syncedLines: [{ text: 'Привет', startTime: 1 }],
  state: 'synced',
  syncedAt: '2026-01-01T00:00:00.000Z',
};

const textOnlyBundle: TrackLyricsBundle = {
  ...syncedBundle,
  syncedLines: null,
  state: 'text-only',
  syncedAt: null,
};

const staleFallback: TrackLyricsBundle = {
  albumId: 'album-1',
  trackId: 'track-1',
  lang: 'ru',
  content: 'Привет',
  syncedLines: [{ text: 'Привет', startTime: 1 }],
  state: 'synced',
  syncedAt: '2026-01-01T00:00:00.000Z',
};

function asRootState(state: { trackLyrics: ReturnType<typeof trackLyricsReducer> }): RootState {
  return state as unknown as RootState;
}

describe('resolveTrackLyricsBundle', () => {
  it('prefers trackLyrics entities over stale album/track fallback', () => {
    const store = configureStore({
      reducer: { trackLyrics: trackLyricsReducer },
    });

    store.dispatch(applyTrackLyricsBundle(textOnlyBundle));

    const resolved = resolveTrackLyricsBundle(
      asRootState(store.getState()),
      'album-1',
      'track-1',
      staleFallback
    );

    expect(resolved.state).toBe('text-only');
    expect(resolved.syncedLines).toBeNull();
  });

  it('uses hydration fallback until Redux is populated', () => {
    const store = configureStore({
      reducer: { trackLyrics: trackLyricsReducer },
    });

    const resolved = resolveTrackLyricsBundle(
      asRootState(store.getState()),
      'album-1',
      'track-1',
      staleFallback
    );

    expect(resolved).toEqual(staleFallback);
  });

  it('finds canonical lang entity even when UI lang differs from fallback lang', () => {
    const store = configureStore({
      reducer: { trackLyrics: trackLyricsReducer },
    });

    store.dispatch(applyTrackLyricsBundle(syncedBundle));

    const enFallback: TrackLyricsBundle = {
      ...staleFallback,
      lang: 'en',
      state: 'empty',
      content: '',
      syncedLines: null,
      syncedAt: null,
    };

    const resolved = resolveTrackLyricsBundle(
      asRootState(store.getState()),
      'album-1',
      'track-1',
      enFallback
    );

    expect(resolved.state).toBe('synced');
    expect(resolved.lang).toBe('ru');
  });
});
