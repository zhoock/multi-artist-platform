/**
 * DELETE /api/albums?trackId=&albumId=&lang= — explicit admin track delete.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireArtistAccount: jest.fn(() => USER_ID),
  };
});

jest.mock('../db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../track-storage-cleanup', () => ({
  extractStoragePathFromTrackRef: jest.fn((path: string) => path),
  removeTrackStoragePaths: jest.fn(),
}));

jest.mock('../track-stems-cleanup', () => ({
  collectTrackStemStoragePaths: jest.fn(),
}));

jest.mock('../album-publish', () => ({
  isAlbumRowReadyToPublish: jest.fn(),
  loadAlbumPublishTrackContext: jest.fn(),
}));

import { query } from '../db';
import { handler } from '../../albums';
import { removeTrackStoragePaths } from '../track-storage-cleanup';
import { collectTrackStemStoragePaths } from '../track-stems-cleanup';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockRemoveTrackStoragePaths = removeTrackStoragePaths as jest.MockedFunction<
  typeof removeTrackStoragePaths
>;
const mockCollectTrackStemStoragePaths = collectTrackStemStoragePaths as jest.MockedFunction<
  typeof collectTrackStemStoragePaths
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ALBUM_ID = 'test-album';
const LOGICAL_TRACK_ID = '3';
const TRACK_DB_ID = 'dddddddd-eeee-4fff-aaaa-bbbbbbbbbbbb';

function makeDeleteTrackEvent(): HandlerEvent {
  return {
    httpMethod: 'DELETE',
    path: '/api/albums',
    queryStringParameters: {
      trackId: LOGICAL_TRACK_ID,
      albumId: ALBUM_ID,
      lang: 'en',
    },
    headers: { authorization: 'Bearer test-token' },
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: '',
    rawQuery: '',
  } as HandlerEvent;
}

function isTrackOwnerLookup(sql: string): boolean {
  const n = sql.replace(/\s+/g, ' ').trim();
  return n.includes('FROM tracks t') && n.includes('t.track_id = $3');
}

function isDeleteTracksSql(sql: string): boolean {
  const n = sql.replace(/\s+/g, ' ').trim();
  return n.startsWith('DELETE FROM tracks t') && n.includes('t.track_id = $3');
}

describe('albums DELETE track (admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCollectTrackStemStoragePaths.mockResolvedValue([]);
    mockRemoveTrackStoragePaths.mockResolvedValue(undefined);
  });

  test('delete track with stems includes stem paths in storage cleanup', async () => {
    const stemPaths = [
      `users/${USER_ID}/audio/${ALBUM_ID}/${LOGICAL_TRACK_ID}/stems.json`,
      `users/${USER_ID}/audio/${ALBUM_ID}/${LOGICAL_TRACK_ID}/stem-1.wav`,
    ];
    mockCollectTrackStemStoragePaths.mockResolvedValue(stemPaths);

    mockQuery.mockImplementation(async (sql: string) => {
      if (isTrackOwnerLookup(sql)) {
        return {
          rows: [
            {
              src: `users/${USER_ID}/audio/${ALBUM_ID}/master.mp3`,
              master_path: null,
              track_db_id: TRACK_DB_ID,
              album_pk: 'album-pk',
              lang: 'en',
            },
          ],
        } as never;
      }
      if (sql.includes('FROM track_assets')) {
        return { rows: [] } as never;
      }
      if (isDeleteTracksSql(sql)) {
        return { rows: [{ id: TRACK_DB_ID }] } as never;
      }
      if (sql.includes('DELETE FROM synced_lyrics')) {
        return { rows: [] } as never;
      }
      if (sql.includes('SELECT COUNT(*)')) {
        return { rows: [{ count: '2' }] } as never;
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const response = await handler(makeDeleteTrackEvent(), {} as never);
    expect(response?.statusCode).toBe(200);

    expect(mockCollectTrackStemStoragePaths).toHaveBeenCalledWith(
      USER_ID,
      ALBUM_ID,
      LOGICAL_TRACK_ID
    );
    expect(mockRemoveTrackStoragePaths).toHaveBeenCalledTimes(1);
    const removed = mockRemoveTrackStoragePaths.mock.calls[0][0] as string[];
    for (const stemPath of stemPaths) {
      expect(removed).toContain(stemPath);
    }
  });

  test('delete track without stems still succeeds', async () => {
    mockCollectTrackStemStoragePaths.mockResolvedValue([]);

    mockQuery.mockImplementation(async (sql: string) => {
      if (isTrackOwnerLookup(sql)) {
        return {
          rows: [
            {
              src: null,
              master_path: null,
              track_db_id: TRACK_DB_ID,
              album_pk: 'album-pk',
              lang: 'en',
            },
          ],
        } as never;
      }
      if (sql.includes('FROM track_assets')) {
        return { rows: [] } as never;
      }
      if (isDeleteTracksSql(sql)) {
        return { rows: [{ id: TRACK_DB_ID }] } as never;
      }
      if (sql.includes('DELETE FROM synced_lyrics')) {
        return { rows: [] } as never;
      }
      if (sql.includes('SELECT COUNT(*)')) {
        return { rows: [{ count: '1' }] } as never;
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const response = await handler(makeDeleteTrackEvent(), {} as never);
    expect(response?.statusCode).toBe(200);
    expect(mockCollectTrackStemStoragePaths).toHaveBeenCalledTimes(1);
    expect(mockRemoveTrackStoragePaths).not.toHaveBeenCalled();
  });

  test('isolation: collect stems only for deleted logical trackId', async () => {
    mockCollectTrackStemStoragePaths.mockResolvedValue([
      `users/${USER_ID}/audio/${ALBUM_ID}/${LOGICAL_TRACK_ID}/stem-a.wav`,
    ]);

    mockQuery.mockImplementation(async (sql: string) => {
      if (isTrackOwnerLookup(sql)) {
        return {
          rows: [
            {
              src: null,
              master_path: null,
              track_db_id: TRACK_DB_ID,
              album_pk: 'album-pk',
              lang: 'en',
            },
          ],
        } as never;
      }
      if (sql.includes('FROM track_assets')) {
        return { rows: [] } as never;
      }
      if (isDeleteTracksSql(sql)) {
        return { rows: [{ id: TRACK_DB_ID }] } as never;
      }
      if (sql.includes('DELETE FROM synced_lyrics')) {
        return { rows: [] } as never;
      }
      if (sql.includes('SELECT COUNT(*)')) {
        return { rows: [{ count: '2' }] } as never;
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    await handler(makeDeleteTrackEvent(), {} as never);

    expect(mockCollectTrackStemStoragePaths).toHaveBeenCalledWith(
      USER_ID,
      ALBUM_ID,
      LOGICAL_TRACK_ID
    );
    const removed = mockRemoveTrackStoragePaths.mock.calls[0][0] as string[];
    expect(removed.some((p) => p.includes('/2/'))).toBe(false);
  });
});
