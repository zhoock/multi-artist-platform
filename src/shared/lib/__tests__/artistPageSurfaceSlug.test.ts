import { describe, expect, it } from '@jest/globals';
import type { Location } from 'react-router-dom';

import { getArtistSlugFromSearch, resolveArtistPageSurfaceSlug } from '../artistPageSurfaceSlug';

function loc(search: string): Location {
  return {
    pathname: '/',
    search,
    hash: '',
    state: null,
    key: 'test',
  };
}

describe('resolveArtistPageSurfaceSlug', () => {
  it('uses URL search params when overlay is closed', () => {
    expect(
      resolveArtistPageSurfaceSlug('from-url', {
        overlayOpen: false,
        surfaceLocation: loc('?artist=surface'),
      })
    ).toBe('from-url');
  });

  it('prefers surface ?artist= while dashboard overlay is open', () => {
    expect(
      resolveArtistPageSurfaceSlug(null, {
        overlayOpen: true,
        surfaceLocation: loc('?artist=band-slug'),
      })
    ).toBe('band-slug');
  });

  it('falls back to URL param when overlay is open but surface has no artist', () => {
    expect(
      resolveArtistPageSurfaceSlug('from-url', {
        overlayOpen: true,
        surfaceLocation: loc(''),
      })
    ).toBe('from-url');
  });
});

describe('getArtistSlugFromSearch', () => {
  it('parses with or without leading ?', () => {
    expect(getArtistSlugFromSearch('?artist=a')).toBe('a');
    expect(getArtistSlugFromSearch('artist=b')).toBe('b');
    expect(getArtistSlugFromSearch('')).toBe('');
  });
});
