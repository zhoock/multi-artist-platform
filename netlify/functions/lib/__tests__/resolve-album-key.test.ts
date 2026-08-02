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
  it('prefers site_name over name and public_slug', () => {
    expect(
      resolveArtistDisplayNameFromParts({
        siteName: ' Смоляное Чучелко ',
        userName: 'Yaroslav',
        publicSlug: 'demo-artist',
      })
    ).toBe('Смоляное Чучелко');
  });

  it('falls back to name then public_slug', () => {
    expect(
      resolveArtistDisplayNameFromParts({
        userName: 'Yaroslav',
        publicSlug: 'demo-artist',
      })
    ).toBe('Yaroslav');

    expect(
      resolveArtistDisplayNameFromParts({
        publicSlug: 'demo-artist',
      })
    ).toBe('demo-artist');
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

  it('returns empty string when user is missing', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] } as never);

    await expect(fetchArtistDisplayNameForUserId('uuid-1')).resolves.toBe('');
  });

  it('returns empty string when userId is absent', async () => {
    await expect(fetchArtistDisplayNameForUserId(null)).resolves.toBe('');
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
