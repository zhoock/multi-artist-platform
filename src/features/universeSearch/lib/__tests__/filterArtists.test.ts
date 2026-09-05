import { describe, expect, test } from '@jest/globals';
import type { SceneArtist } from '@components/view/universe3dTypes';
import { filterArtistsForSearch, matchedSlugsFromQuery } from '../filterArtists';

const artists: SceneArtist[] = [
  {
    name: 'Radio Silence',
    publicSlug: 'radio-silence',
    genreCode: 'grunge',
    genreLabel: { en: 'Grunge', ru: 'Гранж' },
  },
  {
    name: 'Northern Lights',
    publicSlug: 'northern-lights',
    genreCode: 'rock',
    genreLabel: { en: 'Rock', ru: 'Рок' },
  },
];

describe('filterArtistsForSearch', () => {
  test('returns empty for blank query', () => {
    expect(filterArtistsForSearch(artists, '   ', 'en')).toEqual([]);
  });

  test('matches name and genre', () => {
    expect(filterArtistsForSearch(artists, 'radio', 'en').map((a) => a.publicSlug)).toEqual([
      'radio-silence',
    ]);
    expect(filterArtistsForSearch(artists, 'гранж', 'ru').map((a) => a.publicSlug)).toEqual([
      'radio-silence',
    ]);
  });

  test('matchedSlugsFromQuery returns slugs', () => {
    expect(matchedSlugsFromQuery(artists, 'rock', 'en')).toEqual(['northern-lights']);
  });
});
