import { describe, expect, test } from '@jest/globals';

import { toPlayerTrack, toPlayerTracks } from '../toPlayerTrack';

describe('toPlayerTrack', () => {
  test('keeps lyrics fields and strips the rest of a fat track', () => {
    const thin = toPlayerTrack(
      {
        id: 't1',
        title: 'Song',
        order_index: 2,
        content: 'full lyrics text that must not enter the player queue',
        authorship: 'Writer',
        duration: 210,
        src: 'https://cdn.example/a.mp3',
        visibility: 'subscribers_only',
        playbackLocked: true,
        lyrics: {
          albumId: 'alb',
          trackId: 't1',
          lang: 'ru',
          content: 'x',
          authorship: null,
          syncedLines: [{ text: 'x', startTime: 0 }],
          state: 'synced',
          syncedAt: '2026-01-01T00:00:00.000Z',
        },
        translations: { en: { title: 'Song EN', content: 'EN' } },
      } as never,
      'alb'
    );

    expect(thin).toMatchObject({
      id: 't1',
      albumId: 'alb',
      title: 'Song',
      duration: 210,
      src: 'https://cdn.example/a.mp3',
      playbackLocked: true,
      visibility: 'subscribers_only',
      content: 'full lyrics text that must not enter the player queue',
      authorship: 'Writer',
    });
    expect(thin?.lyrics?.state).toBe('synced');
    expect(thin).not.toHaveProperty('translations');
    expect(thin).not.toHaveProperty('order_index');
  });

  test('toPlayerTracks drops invalid rows', () => {
    expect(
      toPlayerTracks([{ title: 'no-id', duration: 1, src: 'a.mp3' } as never, null, undefined])
    ).toEqual([]);
  });
});
