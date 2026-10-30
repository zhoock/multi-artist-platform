import { describe, expect, test } from '@jest/globals';

import { stripRedundantArtistPrefixFromTrackTitle } from '../miniPlayerTrackTitle';

describe('stripRedundantArtistPrefixFromTrackTitle', () => {
  test('removes hyphenated artist prefix', () => {
    expect(
      stripRedundantArtistPrefixFromTrackTitle(
        'Beatles',
        'Beatles - Norwegian Wood (This Bird Has Flown)'
      )
    ).toBe('Norwegian Wood (This Bird Has Flown)');
  });

  test('removes em dash artist prefix', () => {
    expect(stripRedundantArtistPrefixFromTrackTitle('Beatles', 'Beatles — Help!')).toBe('Help!');
  });

  test('leaves title unchanged when prefix does not match', () => {
    expect(stripRedundantArtistPrefixFromTrackTitle('Beatles', 'Norwegian Wood')).toBe(
      'Norwegian Wood'
    );
  });
});
