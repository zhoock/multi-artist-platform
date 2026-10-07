import { describe, expect, jest, test } from '@jest/globals';

import { runArtistCardPlayAction } from '../runArtistCardPlayAction';

describe('runArtistCardPlayAction', () => {
  test('pause when same artist is playing', async () => {
    const pausePlayback = jest.fn();
    const result = await runArtistCardPlayAction({
      publicSlug: 'artist-a',
      readPlayerSnapshot: () => ({
        startingArtistSlug: null,
        activeArtistSlug: 'artist-a',
        isPlaying: true,
        hasActiveQueue: true,
      }),
      getInflight: () => null,
      setInflight: () => undefined,
      setStartingSlug: () => undefined,
      pausePlayback,
      resumePlayback: jest.fn(),
      startArtistPlay: jest.fn(async () => ({ ok: true })),
      onArtistPlaySuccess: () => undefined,
    });

    expect(result).toBe(true);
    expect(pausePlayback).toHaveBeenCalledTimes(1);
  });

  test('resume when same artist paused with queue', async () => {
    const resumePlayback = jest.fn();
    const result = await runArtistCardPlayAction({
      publicSlug: 'artist-a',
      readPlayerSnapshot: () => ({
        startingArtistSlug: null,
        activeArtistSlug: 'artist-a',
        isPlaying: false,
        hasActiveQueue: true,
      }),
      getInflight: () => null,
      setInflight: () => undefined,
      setStartingSlug: () => undefined,
      pausePlayback: jest.fn(),
      resumePlayback,
      startArtistPlay: jest.fn(async () => ({ ok: true })),
      onArtistPlaySuccess: () => undefined,
    });

    expect(result).toBe(true);
    expect(resumePlayback).toHaveBeenCalledTimes(1);
  });

  test('cold start uses artist play bootstrap', async () => {
    const startArtistPlay = jest.fn(async () => ({ ok: true }));
    let starting: string | null = null;

    await runArtistCardPlayAction({
      publicSlug: 'artist-b',
      readPlayerSnapshot: () => ({
        startingArtistSlug: null,
        activeArtistSlug: 'artist-a',
        isPlaying: true,
        hasActiveQueue: true,
      }),
      getInflight: () => null,
      setInflight: () => undefined,
      setStartingSlug: (slug) => {
        starting = slug;
      },
      pausePlayback: jest.fn(),
      resumePlayback: jest.fn(),
      startArtistPlay,
      onArtistPlaySuccess: () => undefined,
    });

    expect(starting).toBe('artist-b');
    expect(startArtistPlay).toHaveBeenCalledTimes(1);
  });
});
