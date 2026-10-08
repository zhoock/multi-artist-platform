/**
 * Public page and catalog reads must not touch playback Storage.
 * One crawler pass over the sitemap used to HEAD every ready opus object per URL.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET?.trim() || 'public-read-reconcile-test-secret';

const download = jest.fn();

jest.mock('../db', () => ({ query: jest.fn() }));
jest.mock('../supabase', () => ({
  STORAGE_BUCKET_NAME: 'user-media',
  createSupabaseAdminClient: jest.fn(() => ({
    storage: { from: () => ({ download }) },
  })),
}));
jest.mock('../reconcile-user-public-playable-tracks', () => ({
  reconcileUserPublicPlayableTracks: jest.fn(),
}));
jest.mock('../track-playback-storage-reconcile', () => ({
  reconcileAlbumPlaybackStorageBatch: jest.fn(),
  reconcileReadyPlaybackStorageIfMissing: jest.fn(),
  verifyPlaybackStoragePathExists: jest.fn(),
  reconcileProcessedTrackPlaybackStorage: jest.fn(),
}));

import { query } from '../db';
import { reconcileUserPublicPlayableTracks } from '../reconcile-user-public-playable-tracks';
import {
  reconcileAlbumPlaybackStorageBatch,
  verifyPlaybackStoragePathExists,
} from '../track-playback-storage-reconcile';
import { handler as publicArtistsHandler } from '../../public-artists';
import { handler as sitemapHandler } from '../../sitemap';
import { handler as userProfileHandler } from '../../user-profile';
import { handler as articlesHandler } from '../../articles-api';
import { handler as albumsHandler } from '../../albums';
import { handler as albumDetailsHandler } from '../../artist-album-details';
import { handler as catalogHandler } from '../../artist-albums-catalog';

const mockQuery = query as jest.MockedFunction<typeof query>;
const USER_ID = '8e998d76-1131-42ec-b26e-ef18603d8cec';
const ALBUM_PK = '11111111-1111-4111-8111-111111111111';

function rows(data: unknown[]) {
  return { rows: data } as never;
}

function installPermissiveDb(): void {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = sql.replace(/\s+/g, ' ');

    if (text.includes('JOIN genres g')) {
      return rows([
        {
          id: USER_ID,
          name: 'Artist',
          site_name: 'Artist',
          public_slug: 'beatles',
          genre_code: 'rock',
          label_en: 'Rock',
          label_ru: 'Рок',
          header_images: [],
          monetization_shop_id: null,
        },
      ]);
    }

    if (text.includes('WHERE public_slug = $1') || text.includes('WHERE u.id = $1')) {
      return rows([
        {
          id: USER_ID,
          name: 'Artist',
          public_slug: 'beatles',
          the_band: null,
          header_images: [],
          social_links: {},
          site_name: 'Artist',
          genre_code: 'rock',
          has_published_tracks: true,
          has_public_articles: false,
          has_profile_content: false,
        },
      ]);
    }

    if (text.includes('has_published_tracks')) {
      return rows([{ has_published_tracks: true }]);
    }

    if (
      text.includes('FROM albums a') &&
      text.includes('a.user_id = $1') &&
      text.includes('a.album_id')
    ) {
      return rows([
        {
          id: ALBUM_PK,
          user_id: USER_ID,
          album_id: 'rubber-soul',
          artist: 'Artist',
          artist_display_name: 'Artist',
          album: 'Rubber Soul',
          full_name: '',
          description: '',
          cover: '',
          release: {},
          buttons: {},
          details: [],
          photographer: '',
          photographer_url: '',
          designer: '',
          designer_url: '',
          lang: 'ru',
          is_public: true,
          is_published: true,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ]);
    }

    if (text.includes('FROM albums a') && text.includes('a.album_id = $2')) {
      return rows([
        {
          id: ALBUM_PK,
          user_id: USER_ID,
          album_id: 'rubber-soul',
          album: 'Rubber Soul',
          full_name: '',
          description: '',
          cover: '',
          release: {},
          buttons: {},
          details: [],
          photographer: '',
          photographer_url: '',
          designer: '',
          designer_url: '',
          is_public: true,
          is_published: true,
          lang: 'ru',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ]);
    }

    if (text.includes('FROM tracks t') && text.includes('t.album_id = ANY')) {
      return rows([
        {
          album_pk: ALBUM_PK,
          track_id: 'norwegian-wood',
          title: 'Norwegian Wood',
          duration: 120,
          src: 'norwegian-wood.opus',
          order_index: 0,
          visibility: 'public',
          stems_visibility: 'public',
          processing_status: 'ready',
          content: null,
          authorship: null,
        },
      ]);
    }

    return rows([]);
  });
}

function assertNoPlaybackStorageReconcile(): void {
  expect(reconcileUserPublicPlayableTracks).not.toHaveBeenCalled();
  expect(reconcileAlbumPlaybackStorageBatch).not.toHaveBeenCalled();
  expect(verifyPlaybackStoragePathExists).not.toHaveBeenCalled();
  expect(download).not.toHaveBeenCalled();
  const storageHeads = (global.fetch as jest.Mock).mock.calls.filter(([url, init]) => {
    const href = String(url);
    return init?.method === 'HEAD' && href.includes('/storage/v1/object/');
  });
  expect(storageHeads).toHaveLength(0);
}

describe('public reads do not reconcile playback storage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    download.mockReset();
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    installPermissiveDb();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('GET /api/public-artists', async () => {
    const response = await (
      publicArtistsHandler as (e: unknown) => Promise<{ statusCode: number }>
    )({
      httpMethod: 'GET',
      path: '/api/public-artists',
      headers: {},
      queryStringParameters: null,
    });

    expect(response.statusCode).toBe(200);
    assertNoPlaybackStorageReconcile();
  });

  test('GET /sitemap.xml', async () => {
    const response = await (sitemapHandler as (e: unknown) => Promise<{ statusCode: number }>)({
      httpMethod: 'GET',
      path: '/sitemap.xml',
      headers: {},
      queryStringParameters: null,
    });

    expect(response.statusCode).toBe(200);
    assertNoPlaybackStorageReconcile();
  });

  test('GET /api/user-profile?artist= reads the profile without a storage check', async () => {
    const response = await userProfileHandler(
      {
        httpMethod: 'GET',
        path: '/api/user-profile',
        queryStringParameters: { artist: 'beatles', lang: 'ru' },
        headers: {},
      } as never,
      {} as never
    );

    expect(response?.statusCode).toBe(200);
    assertNoPlaybackStorageReconcile();
  });

  test('GET /api/articles-api?artist=', async () => {
    const response = await (articlesHandler as (e: unknown) => Promise<{ statusCode: number }>)({
      httpMethod: 'GET',
      path: '/api/articles-api',
      headers: {},
      queryStringParameters: { artist: 'beatles', lang: 'ru' },
    });

    expect(response.statusCode).toBe(200);
    assertNoPlaybackStorageReconcile();
  });

  test('GET /api/artists/:slug/albums', async () => {
    const response = await (catalogHandler as (e: unknown) => Promise<{ statusCode: number }>)({
      httpMethod: 'GET',
      path: '/api/artists/beatles/albums',
      headers: {},
      queryStringParameters: { slug: 'beatles' },
    });

    expect(response.statusCode).toBe(200);
    assertNoPlaybackStorageReconcile();
  });

  test('GET /api/artists/:slug/albums/:albumId', async () => {
    const response = await (albumDetailsHandler as (e: unknown) => Promise<{ statusCode: number }>)(
      {
        httpMethod: 'GET',
        path: '/api/artists/beatles/albums/rubber-soul',
        headers: {},
        queryStringParameters: { slug: 'beatles', albumId: 'rubber-soul' },
      }
    );

    expect(response.statusCode).toBe(200);
    assertNoPlaybackStorageReconcile();
  });

  test('GET /api/albums?artist=', async () => {
    const response = await (albumsHandler as (e: unknown) => Promise<{ statusCode: number }>)({
      httpMethod: 'GET',
      path: '/api/albums',
      headers: {},
      queryStringParameters: { artist: 'beatles' },
    });

    expect(response.statusCode).toBe(200);
    assertNoPlaybackStorageReconcile();
  });
});
