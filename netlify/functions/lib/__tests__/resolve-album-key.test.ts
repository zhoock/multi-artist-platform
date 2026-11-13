import {
  fetchArtistDisplayNameForUserId,
  resolveAlbumByKey,
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

describe('resolveAlbumByKey cover normalization', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('normalizes JSONB { img, backImg } to front storage base name', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'album-pk',
          album_slug: 'rubber-soul',
          artist_display_name: 'Beatles',
          artist_public_slug: 'beatles',
          album: 'Rubber Soul',
          lang: 'en',
          cover: {
            img: 'album_cover_uuid_beatles-Cover-rubber-soul',
            backImg: 'album_cover_uuid_beatles-Back-Cover-rubber-soul',
          },
          user_id: 'artist-1',
        },
      ],
    } as never);

    const album = await resolveAlbumByKey('rubber-soul');
    expect(album?.cover).toBe('album_cover_uuid_beatles-Cover-rubber-soul');
    expect(typeof album?.cover).toBe('string');
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
