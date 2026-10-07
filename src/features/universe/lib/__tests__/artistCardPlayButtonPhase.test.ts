import { describe, expect, test } from '@jest/globals';

import {
  isArtistCardPlayResume,
  resolveArtistCardPlayButtonPhase,
} from '../artistCardPlayButtonPhase';

const base = {
  startingArtistSlug: null,
  activeArtistSlug: 'artist-a',
  isPlaying: false,
  hasActiveQueue: true,
};

describe('resolveArtistCardPlayButtonPhase', () => {
  test('starting for matching starting slug', () => {
    expect(
      resolveArtistCardPlayButtonPhase({
        cardArtistSlug: 'artist-a',
        ...base,
        startingArtistSlug: 'artist-a',
      })
    ).toBe('starting');
  });

  test('pause when same artist is playing', () => {
    expect(
      resolveArtistCardPlayButtonPhase({
        cardArtistSlug: 'artist-a',
        ...base,
        isPlaying: true,
      })
    ).toBe('pause');
  });

  test('play when another artist is active', () => {
    expect(
      resolveArtistCardPlayButtonPhase({
        cardArtistSlug: 'artist-b',
        ...base,
        isPlaying: true,
      })
    ).toBe('play');
  });

  test('play when same artist paused (resume)', () => {
    expect(
      resolveArtistCardPlayButtonPhase({
        cardArtistSlug: 'artist-a',
        ...base,
        isPlaying: false,
      })
    ).toBe('play');
    expect(isArtistCardPlayResume('artist-a', { ...base, isPlaying: false })).toBe(true);
  });
});
