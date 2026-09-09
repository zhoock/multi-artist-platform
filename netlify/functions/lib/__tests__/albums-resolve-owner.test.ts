/**
 * GET /api/albums?resolveOwnerByAlbumId=true — SEO-008 publication gates.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';
import { handler } from '../../albums';

const mockQuery = query as jest.MockedFunction<typeof query>;

const ALBUM_ID = 'debut';
const ARTIST_SLUG = 'my-band';

function makeResolveOwnerEvent(albumId: string): HandlerEvent {
  return {
    httpMethod: 'GET',
    path: '/api/albums',
    queryStringParameters: { resolveOwnerByAlbumId: 'true', albumId },
    headers: {},
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: `/api/albums?resolveOwnerByAlbumId=true&albumId=${encodeURIComponent(albumId)}`,
    rawQuery: `resolveOwnerByAlbumId=true&albumId=${encodeURIComponent(albumId)}`,
  } as HandlerEvent;
}

function isResolveOwnerSql(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  return (
    normalized.includes('SELECT u.public_slug') &&
    normalized.includes('FROM albums a') &&
    normalized.includes('a.album_id = $1')
  );
}

describe('albums GET resolveOwnerByAlbumId (SEO-008)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('published + public album returns artistSlug', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (!isResolveOwnerSql(sql)) {
        throw new Error(`unexpected query: ${sql}`);
      }
      expect(sql).toContain('a.is_published = true');
      expect(sql).toContain('COALESCE(a.is_public, true) = true');
      return { rows: [{ public_slug: ARTIST_SLUG }] } as never;
    });

    const response = await handler(makeResolveOwnerEvent(ALBUM_ID), {} as never);
    expect(response?.statusCode).toBe(200);

    const body = JSON.parse(String(response?.body));
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ artistSlug: ARTIST_SLUG });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('unpublished album returns 404', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (!isResolveOwnerSql(sql)) {
        throw new Error(`unexpected query: ${sql}`);
      }
      return { rows: [] } as never;
    });

    const response = await handler(makeResolveOwnerEvent('draft-album'), {} as never);
    expect(response?.statusCode).toBe(404);
    expect(JSON.parse(String(response?.body)).error).toContain('Album owner slug not found');
  });

  test('private/hidden album returns 404', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (!isResolveOwnerSql(sql)) {
        throw new Error(`unexpected query: ${sql}`);
      }
      return { rows: [] } as never;
    });

    const response = await handler(makeResolveOwnerEvent('secret-album'), {} as never);
    expect(response?.statusCode).toBe(404);
  });

  test('nonexistent album returns 404', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (!isResolveOwnerSql(sql)) {
        throw new Error(`unexpected query: ${sql}`);
      }
      return { rows: [] } as never;
    });

    const response = await handler(makeResolveOwnerEvent('missing-album'), {} as never);
    expect(response?.statusCode).toBe(404);
  });

  test('artist without public_slug returns 404', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (!isResolveOwnerSql(sql)) {
        throw new Error(`unexpected query: ${sql}`);
      }
      expect(sql).toContain('u.public_slug IS NOT NULL');
      return { rows: [] } as never;
    });

    const response = await handler(makeResolveOwnerEvent('no-slug-album'), {} as never);
    expect(response?.statusCode).toBe(404);
  });
});
