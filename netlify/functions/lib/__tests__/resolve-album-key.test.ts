import {
  fetchArtistDisplayNameForUserId,
  resolveArtistDisplayNameFromParts,
} from '../resolve-album-key';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';

const mockedQuery = query as jest.MockedFunction<typeof query>;

describe('resolveArtistDisplayNameFromParts', () => {
  it('prefers site_name over legacy albums.artist', () => {
    expect(
      resolveArtistDisplayNameFromParts({
        siteName: ' Смоляное Чучелко ',
        legacyAlbumArtist: 'Legacy Band',
      })
    ).toBe('Смоляное Чучелко');
  });

  it('falls back to name then public_slug then legacy album artist', () => {
    expect(
      resolveArtistDisplayNameFromParts({
        userName: 'Yaroslav',
        publicSlug: 'demo-artist',
        legacyAlbumArtist: 'Old',
      })
    ).toBe('Yaroslav');

    expect(
      resolveArtistDisplayNameFromParts({
        publicSlug: 'demo-artist',
        legacyAlbumArtist: 'Old',
      })
    ).toBe('demo-artist');

    expect(
      resolveArtistDisplayNameFromParts({
        legacyAlbumArtist: ' Old Band ',
      })
    ).toBe('Old Band');
  });

  it('returns empty string when nothing is available', () => {
    expect(resolveArtistDisplayNameFromParts({})).toBe('');
  });
});

describe('fetchArtistDisplayNameForUserId', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('loads display name from users table', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ site_name: 'Band Name', name: 'Person', public_slug: 'slug' }],
    } as never);

    await expect(fetchArtistDisplayNameForUserId('uuid-1')).resolves.toBe('Band Name');
  });

  it('falls back to legacy album artist when user is missing', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] } as never);

    await expect(fetchArtistDisplayNameForUserId('uuid-1', 'Legacy')).resolves.toBe('Legacy');
  });

  it('returns legacy artist when userId is absent', async () => {
    await expect(fetchArtistDisplayNameForUserId(null, 'Legacy')).resolves.toBe('Legacy');
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
