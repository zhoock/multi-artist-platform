import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';
import { fetchDynamicSitemapEntries } from '../sitemap-data';

const mockQuery = query as jest.MockedFunction<typeof query>;

function sqlIncludesPublishedPublicAlbumGate(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, ' ');
  return (
    normalized.includes('a.is_published = true') &&
    normalized.includes('a.is_public = true') &&
    normalized.includes('FROM albums a')
  );
}

describe('sitemap-data fetchVisibleArtists', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('Case A: artist with only unpublished public album is excluded from sitemap', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('active_artists')) {
        expect(sqlIncludesPublishedPublicAlbumGate(sql)).toBe(true);
        return { rows: [] } as never;
      }
      if (sql.includes('fetchPublicAlbums') || sql.includes('FROM users u')) {
        if (sql.includes('articles ar')) {
          return { rows: [] } as never;
        }
        return { rows: [] } as never;
      }
      return { rows: [] } as never;
    });

    const entries = await fetchDynamicSitemapEntries();
    const artistPaths = entries
      .map((entry) => entry.path)
      .filter((path) => path.includes('artist=draft-only'));

    expect(artistPaths).toHaveLength(0);
  });

  test('Case B: artist with published public album is included in sitemap', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('active_artists')) {
        expect(sqlIncludesPublishedPublicAlbumGate(sql)).toBe(true);
        return {
          rows: [
            {
              public_slug: 'published-band',
              updated_at: '2026-07-01T00:00:00.000Z',
              has_public_albums: true,
              has_public_articles: false,
            },
          ],
        } as never;
      }
      if (sql.includes('articles ar')) {
        return { rows: [] } as never;
      }
      return {
        rows: [
          {
            public_slug: 'published-band',
            album_id: 'debut',
            updated_at: '2026-07-10T00:00:00.000Z',
          },
        ],
      } as never;
    });

    const entries = await fetchDynamicSitemapEntries();
    const paths = entries.map((entry) => entry.path);

    expect(paths).toContain('/ru?artist=published-band');
    expect(paths).toContain('/en?artist=published-band');
    expect(paths).toContain('/ru/albums/debut?artist=published-band');
  });

  test('Case D: profile-only artist remains in sitemap without published albums', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('active_artists')) {
        return {
          rows: [
            {
              public_slug: 'profile-only',
              updated_at: '2026-07-01T00:00:00.000Z',
              has_public_albums: false,
              has_public_articles: false,
            },
          ],
        } as never;
      }
      if (sql.includes('articles ar')) {
        return { rows: [] } as never;
      }
      return { rows: [] } as never;
    });

    const entries = await fetchDynamicSitemapEntries();
    const paths = entries.map((entry) => entry.path);

    expect(paths).toContain('/ru?artist=profile-only');
    expect(paths).toContain('/en?artist=profile-only');
    expect(paths).not.toContain('/ru/albums?artist=profile-only');
  });
});
