import { describe, expect, test } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { trackLyricsReducer } from '../../model/trackLyricsSlice';
import { dispatchTrackLyricsBundle } from '../dispatchTrackLyricsBundle';
import { resolveTrackLyricsBundle } from '../selectors';

describe('dispatchTrackLyricsBundle', () => {
  test('mirrors non-empty canonical ru bundle to UI en key', () => {
    const store = configureStore({ reducer: { trackLyrics: trackLyricsReducer } });

    dispatchTrackLyricsBundle(
      store.dispatch,
      {
        albumId: '23',
        trackId: 'track-a',
        lang: 'ru',
        content: 'Текст',
        state: 'text-only',
        syncedLines: null,
        syncedAt: null,
      },
      'en'
    );

    const resolved = resolveTrackLyricsBundle(store.getState() as never, '23', 'track-a', {
      albumId: '23',
      trackId: 'track-a',
      lang: 'en',
      content: '',
      state: 'empty',
      syncedLines: null,
      syncedAt: null,
    });

    expect(resolved.state).toBe('text-only');
    expect(resolved.content).toBe('Текст');
    expect(store.getState().trackLyrics.entities['23:track-a:en']?.content).toBe('Текст');
  });
});
