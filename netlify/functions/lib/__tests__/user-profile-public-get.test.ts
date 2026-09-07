import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../jwt', () => ({
  classifyAuthorizationHeader: jest.fn(() => ({ kind: 'none' })),
}));

import { query } from '../db';
import { handler } from '../../user-profile';

const mockQuery = query as jest.MockedFunction<typeof query>;

function makeGetEvent(artist: string): HandlerEvent {
  return {
    httpMethod: 'GET',
    path: '/api/user-profile',
    queryStringParameters: { lang: 'ru', artist },
    headers: {},
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: `/api/user-profile?lang=ru&artist=${artist}`,
    rawQuery: `lang=ru&artist=${artist}`,
  } as HandlerEvent;
}

const publishedArtistRow = {
  id: 'user-published',
  name: 'Test Artist',
  public_slug: 'test-artist',
  the_band: { ru: ['Bio'], en: [] },
  header_images: ['/api/proxy-image?path=users/user-published/hero/cover-1920.jpg'],
  social_links: { instagram: 'https://instagram.com/test' },
  site_name: 'Test Site',
  genre_code: 'rock',
};

describe('user-profile GET ?artist=', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('published artist with profile content returns 200 with a single users query', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE public_slug = $1')) {
        return { rows: [publishedArtistRow] } as never;
      }
      if (sql.includes('has_published_tracks')) {
        throw new Error('should not check tracks when profile fields prove visibility');
      }
      if (sql.includes('has_public_articles')) {
        throw new Error('should not check articles when profile fields prove visibility');
      }
      if (sql.includes('has_profile_content')) {
        throw new Error('should not re-read users row for public artist GET');
      }
      if (sql.includes('WHERE id = $1')) {
        throw new Error('should not fetch profile by id after slug prefetch');
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const response = await handler(makeGetEvent('test-artist'), {} as never);
    expect(response?.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    const body = JSON.parse(String(response?.body));
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      name: 'Test Artist',
      publicSlug: 'test-artist',
      theBand: ['Bio'],
      headerImages: publishedArtistRow.header_images,
      siteName: 'Test Site',
      genreCode: 'rock',
      socialLinks: { instagram: 'https://instagram.com/test' },
    });
  });

  test('articles-only artist returns 200', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE public_slug = $1')) {
        return {
          rows: [
            {
              ...publishedArtistRow,
              header_images: [],
              the_band: { ru: [], en: [] },
              social_links: {},
            },
          ],
        } as never;
      }
      if (sql.includes('has_published_tracks')) {
        return { rows: [{ has_published_tracks: false }] } as never;
      }
      if (sql.includes('has_public_articles')) {
        return { rows: [{ has_public_articles: true }] } as never;
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const response = await handler(makeGetEvent('test-artist'), {} as never);
    expect(response?.statusCode).toBe(200);
  });

  test('unpublished artist returns 404 ARTIST_NOT_PUBLISHED', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE public_slug = $1')) {
        return {
          rows: [
            {
              ...publishedArtistRow,
              header_images: [],
              the_band: { ru: [], en: [] },
              social_links: {},
            },
          ],
        } as never;
      }
      if (sql.includes('has_published_tracks')) {
        return { rows: [{ has_published_tracks: false }] } as never;
      }
      if (sql.includes('has_public_articles')) {
        return { rows: [{ has_public_articles: false }] } as never;
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const response = await handler(makeGetEvent('test-artist'), {} as never);
    expect(response?.statusCode).toBe(404);

    const body = JSON.parse(String(response?.body));
    expect(body.code).toBe('ARTIST_NOT_PUBLISHED');
  });

  test('missing slug returns 404 ARTIST_NOT_FOUND', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('WHERE public_slug = $1')) {
        return { rows: [] } as never;
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const response = await handler(makeGetEvent('missing-artist'), {} as never);
    expect(response?.statusCode).toBe(404);

    const body = JSON.parse(String(response?.body));
    expect(body.code).toBe('ARTIST_NOT_FOUND');
  });
});
