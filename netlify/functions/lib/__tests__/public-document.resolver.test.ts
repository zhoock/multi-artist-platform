import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../public-artist-resolver', () => ({
  PublicArtistResolverError: class PublicArtistResolverError extends Error {
    statusCode: number;
    code?: string;
    constructor(statusCode: number, message: string, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
  fetchPublicArtistProfileBySlug: jest.fn(),
  resolvePublicArtistUserId: jest.fn(),
}));

import { query } from '../db';
import {
  fetchPublicArtistProfileBySlug,
  resolvePublicArtistUserId,
} from '../public-artist-resolver';
import {
  artistSlugExists,
  isAlbumPubliclyAccessible,
  isArticlePubliclyAccessible,
  resolveDocumentAllow,
} from '../public-document/resolver';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockFetchArtist = fetchPublicArtistProfileBySlug as jest.MockedFunction<
  typeof fetchPublicArtistProfileBySlug
>;
const mockResolveArtist = resolvePublicArtistUserId as jest.MockedFunction<
  typeof resolvePublicArtistUserId
>;

describe('public-document resolver', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockFetchArtist.mockReset();
    mockResolveArtist.mockReset();
  });

  test('existing artist → allow', async () => {
    mockFetchArtist.mockResolvedValue({ id: 'u1' } as never);
    await expect(artistSlugExists('my-band')).resolves.toBe(true);
    await expect(
      resolveDocumentAllow({ type: 'artistRequired', artistSlug: 'my-band' })
    ).resolves.toBe(true);
  });

  test('missing artist → deny', async () => {
    const { PublicArtistResolverError } = await import('../public-artist-resolver');
    mockFetchArtist.mockRejectedValue(new PublicArtistResolverError(404, 'Artist not found'));
    await expect(artistSlugExists('missing')).resolves.toBe(false);
  });

  test('under-construction artist (exists in DB) → allow', async () => {
    mockFetchArtist.mockResolvedValue({ id: 'u1', public_slug: 'new-artist' } as never);
    await expect(
      resolveDocumentAllow({ type: 'artistRequired', artistSlug: 'new-artist' })
    ).resolves.toBe(true);
  });

  test('existing public album → allow', async () => {
    mockResolveArtist.mockResolvedValue('user-1');
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ album: 'Debut', is_public: true, is_published: true }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ count: '3' }] } as never);

    await expect(isAlbumPubliclyAccessible('my-band', 'debut')).resolves.toBe(true);
  });

  test('missing album → deny', async () => {
    mockResolveArtist.mockResolvedValue('user-1');
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(isAlbumPubliclyAccessible('my-band', 'missing')).resolves.toBe(false);
  });

  test('wrong artist (slug not found) → deny', async () => {
    const { PublicArtistResolverError } = await import('../public-artist-resolver');
    mockResolveArtist.mockRejectedValue(new PublicArtistResolverError(404, 'Artist not found'));
    await expect(isAlbumPubliclyAccessible('wrong', 'debut')).resolves.toBe(false);
  });

  test('unpublished/private album → deny', async () => {
    mockResolveArtist.mockResolvedValue('user-1');
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ album: 'Secret', is_public: false, is_published: false }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ count: '2' }] } as never);

    await expect(isAlbumPubliclyAccessible('my-band', 'secret')).resolves.toBe(false);
  });

  test('existing public article → allow', async () => {
    mockResolveArtist.mockResolvedValue('user-1');
    mockQuery.mockResolvedValueOnce({
      rows: [{ visibility: 'public', is_draft: false }],
    } as never);
    await expect(isArticlePubliclyAccessible('post-1', 'my-band')).resolves.toBe(true);
  });

  test('missing article → deny', async () => {
    mockResolveArtist.mockResolvedValue('user-1');
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(isArticlePubliclyAccessible('missing', 'my-band')).resolves.toBe(false);
  });

  test('hidden/draft article → deny', async () => {
    mockResolveArtist.mockResolvedValue('user-1');
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(isArticlePubliclyAccessible('hidden-post', null)).resolves.toBe(false);
  });

  test('unknown route → deny', async () => {
    await expect(resolveDocumentAllow({ type: 'unknown' })).resolves.toBe(false);
  });

  test('help unknown category → deny', async () => {
    await expect(
      resolveDocumentAllow({
        type: 'helpCategory',
        categorySlug: 'not-a-real-category',
        lang: 'ru',
      })
    ).resolves.toBe(false);
  });
});
