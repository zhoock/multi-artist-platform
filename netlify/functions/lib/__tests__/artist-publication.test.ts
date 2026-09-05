import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { isArtistPublishedFromSignals } from '../artist-publication-signals';
import {
  artistHasPublicPageContent,
  assertArtistVisibleToViewer,
  hasPublicProfileContentFromFields,
} from '../artist-publication';
import { PublicArtistResolverError } from '../public-artist-resolver';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('artist-publication', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('catalog includes artist only when there are published tracks', () => {
    expect(isArtistPublishedFromSignals({ hasPublishedTracks: true })).toBe(true);
    expect(isArtistPublishedFromSignals({ hasPublishedTracks: false })).toBe(false);
  });

  test('public albums without tracks do not publish profile to catalog', () => {
    expect(isArtistPublishedFromSignals({ hasPublishedTracks: false })).toBe(false);
  });

  describe('hasPublicProfileContentFromFields', () => {
    test('returns true when header_images has a non-empty entry', () => {
      expect(
        hasPublicProfileContentFromFields({
          header_images: ['/api/proxy-image?path=users/u1/hero/cover-1920.jpg'],
        })
      ).toBe(true);
    });

    test('returns true when the_band has filled paragraphs', () => {
      expect(
        hasPublicProfileContentFromFields({
          the_band: { ru: ['About the band'], en: [] },
        })
      ).toBe(true);
    });

    test('returns true when social_links has a non-empty URL', () => {
      expect(
        hasPublicProfileContentFromFields({
          social_links: { instagram: 'https://instagram.com/artist' },
        })
      ).toBe(true);
    });

    test('returns false for empty profile content', () => {
      expect(
        hasPublicProfileContentFromFields({
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        })
      ).toBe(false);
    });
  });

  describe('artistHasPublicPageContent with preloaded profile fields', () => {
    test('uses in-memory profile content and runs tracks/articles queries in parallel', async () => {
      let inFlight = 0;
      let maxInFlight = 0;

      mockQuery.mockImplementation(async (sql: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;

        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: true }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        if (sql.includes('has_profile_content')) {
          throw new Error('should not re-read users when profileContentFields are provided');
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const visible = await artistHasPublicPageContent('user-1', {
        profileContentFields: {
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        },
      });

      expect(visible).toBe(true);
      expect(maxInFlight).toBe(2);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    test('returns true for articles-only artist without tracks or profile body', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: false }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: true }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const visible = await artistHasPublicPageContent('user-2', {
        profileContentFields: {
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        },
      });

      expect(visible).toBe(true);
    });

    test('returns false for unpublished artist with empty signals', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: false }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      const visible = await artistHasPublicPageContent('user-3', {
        profileContentFields: {
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        },
      });

      expect(visible).toBe(false);
    });
  });

  describe('assertArtistVisibleToViewer', () => {
    test('throws ARTIST_NOT_PUBLISHED for invisible artist', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('has_published_tracks')) {
          return { rows: [{ has_published_tracks: false }] } as never;
        }
        if (sql.includes('has_public_articles')) {
          return { rows: [{ has_public_articles: false }] } as never;
        }
        throw new Error(`unexpected query: ${sql}`);
      });

      await expect(
        assertArtistVisibleToViewer('user-4', null, {
          profileContentFields: {
            header_images: [],
            the_band: { ru: [], en: [] },
            social_links: {},
          },
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'ARTIST_NOT_PUBLISHED',
      } satisfies Partial<PublicArtistResolverError>);
    });

    test('skips visibility checks when viewer is the artist owner', async () => {
      await assertArtistVisibleToViewer('owner-id', 'owner-id', {
        profileContentFields: {
          header_images: [],
          the_band: { ru: [], en: [] },
          social_links: {},
        },
      });

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
