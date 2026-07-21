import { describe, expect, test } from '@jest/globals';

import { createMockAlbumDetails } from '../../model/__tests__/albumDetailsFixtures';
import {
  albumDetailsMatchRoute,
  resolveAlbumDetailsForRoute,
} from '../resolveAlbumDetailsForRoute';

const ARTIST = 'test-artist';

describe('resolveAlbumDetailsForRoute', () => {
  test('returns details when slot and payload match route', () => {
    const details = createMockAlbumDetails({ albumId: 'album-b', slug: 'album-b' });

    expect(
      resolveAlbumDetailsForRoute({
        resolvedDetails: details,
        routeAlbumId: 'album-b',
        artistSlug: ARTIST,
        slotArtistSlug: ARTIST,
        slotAlbumId: 'album-b',
      })
    ).toBe(details);
  });

  test('returns undefined while loading another album (A → B navigation)', () => {
    const stale = createMockAlbumDetails({ albumId: 'album-a', slug: 'album-a' });

    expect(
      resolveAlbumDetailsForRoute({
        resolvedDetails: stale,
        routeAlbumId: 'album-b',
        artistSlug: ARTIST,
        slotArtistSlug: ARTIST,
        slotAlbumId: 'album-b',
      })
    ).toBeUndefined();
  });

  test('keeps rename SWR after adoptAlbumDetailsAlbumId (payload slug matches route)', () => {
    const adopted = createMockAlbumDetails({
      albumId: 'stand-up-remastered',
      slug: 'stand-up-remastered',
      title: 'Stand Up',
    });

    expect(
      albumDetailsMatchRoute({
        resolvedDetails: adopted,
        routeAlbumId: 'stand-up-remastered',
        artistSlug: ARTIST,
        slotArtistSlug: ARTIST,
        slotAlbumId: 'stand-up-remastered',
      })
    ).toBe(true);
  });
});
