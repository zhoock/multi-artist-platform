import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

const getUserIdFromEventMock = jest.fn<() => string | null>(() => null);

jest.mock('../api-helpers', () => ({
  getUserIdFromEvent: () => getUserIdFromEventMock(),
}));

const getArtistUserIdForAlbumSlugMock = jest.fn();
const getViewerEmailLowerMock = jest.fn();
const viewerHasPremiumAccessToArtistMock = jest.fn();
const isAlbumOwnedByUserMock = jest.fn();
const resolveTrackPublicUrlMock = jest.fn();

jest.mock('../entitlements', () => ({
  getArtistUserIdForAlbumSlug: (...args: unknown[]) => getArtistUserIdForAlbumSlugMock(...args),
  getViewerEmailLower: (...args: unknown[]) => getViewerEmailLowerMock(...args),
  viewerHasPremiumAccessToArtist: (...args: unknown[]) =>
    viewerHasPremiumAccessToArtistMock(...args),
}));

jest.mock('../purchase-access', () => ({
  isAlbumOwnedByUser: (...args: unknown[]) => isAlbumOwnedByUserMock(...args),
}));

jest.mock('../track-storage', () => ({
  resolveTrackPublicUrl: (...args: unknown[]) => resolveTrackPublicUrlMock(...args),
}));

import { query } from '../db';
import { handler } from '../../download-track';

const mockedQuery = query as jest.MockedFunction<typeof query>;

function getEvent(queryParams: Record<string, string | undefined>): HandlerEvent {
  return {
    httpMethod: 'GET',
    queryStringParameters: queryParams,
    headers: {},
    body: null,
    path: '/api/download',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: '',
    rawQuery: '',
  } as HandlerEvent;
}

describe('download-track authenticated album path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserIdFromEventMock.mockReturnValue(null);
  });

  test('rejects albumId + track without Authorization', async () => {
    const response = await handler(
      getEvent({ albumId: 'album-slug', track: 'track-1' }),
      {} as never
    );

    expect(response?.statusCode).toBe(400);
    const body = JSON.parse(response?.body ?? '{}') as { error?: string };
    expect(body.error).toMatch(/Authorization/i);
  });

  test('rejects track-only requests without albumId and auth', async () => {
    const response = await handler(getEvent({ track: 'track-1' }), {} as never);

    expect(response?.statusCode).toBe(400);
    const body = JSON.parse(response?.body ?? '{}') as { error?: string };
    expect(body.error).toMatch(/albumId/i);
    expect(body.error).toMatch(/Authorization/i);
  });

  test('rejects unauthenticated user without purchase or subscription', async () => {
    getUserIdFromEventMock.mockReturnValue('user-1');
    getArtistUserIdForAlbumSlugMock.mockResolvedValue('artist-1');
    getViewerEmailLowerMock.mockResolvedValue('buyer@example.com');
    isAlbumOwnedByUserMock.mockResolvedValue(false);
    viewerHasPremiumAccessToArtistMock.mockResolvedValue(false);

    const response = await handler(
      getEvent({ albumId: 'album-slug', track: 'track-1' }),
      {} as never
    );

    expect(response?.statusCode).toBe(403);
    const body = JSON.parse(response?.body ?? '{}') as { error?: string };
    expect(body.error).toMatch(/purchase this album or subscribe/i);
  });

  test('redirects when user owns the album', async () => {
    getUserIdFromEventMock.mockReturnValue('user-1');
    getArtistUserIdForAlbumSlugMock.mockResolvedValue('artist-1');
    getViewerEmailLowerMock.mockResolvedValue('buyer@example.com');
    isAlbumOwnedByUserMock.mockResolvedValue(true);
    viewerHasPremiumAccessToArtistMock.mockResolvedValue(false);
    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          src: 'tracks/foo.mp3',
          master_path: null,
          title: 'Track',
          album_id: 'album-slug',
          album_user_id: 'artist-1',
        },
      ],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });
    resolveTrackPublicUrlMock.mockResolvedValue('https://cdn.example/track.mp3');

    const response = await handler(
      getEvent({ albumId: 'album-slug', track: 'track-1' }),
      {} as never
    );

    expect(response?.statusCode).toBe(302);
    expect(response?.headers?.Location).toBe('https://cdn.example/track.mp3');
  });

  test('redirects when user has subscription access to artist', async () => {
    getUserIdFromEventMock.mockReturnValue('user-1');
    getArtistUserIdForAlbumSlugMock.mockResolvedValue('artist-1');
    getViewerEmailLowerMock.mockResolvedValue('buyer@example.com');
    isAlbumOwnedByUserMock.mockResolvedValue(false);
    viewerHasPremiumAccessToArtistMock.mockResolvedValue(true);
    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          src: 'tracks/foo.mp3',
          master_path: null,
          title: 'Track',
          album_id: 'album-slug',
          album_user_id: 'artist-1',
        },
      ],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });
    resolveTrackPublicUrlMock.mockResolvedValue('https://cdn.example/track.mp3');

    const response = await handler(
      getEvent({ albumId: 'album-slug', track: 'track-1' }),
      {} as never
    );

    expect(response?.statusCode).toBe(302);
    expect(viewerHasPremiumAccessToArtistMock).toHaveBeenCalledWith('user-1', 'artist-1');
  });
});
