/**
 * PUT /api/albums publish branch — server-authoritative track readiness (P1-7 Chain 3).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireArtistAccount: jest.fn(() => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
  };
});

jest.mock('../db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../track-pipeline-schema', () => ({
  tracksTableHasPipelineColumns: jest.fn(),
  trackAssetsTableExists: jest.fn(),
}));

jest.mock('../github-api', () => ({
  updateAlbumsJson: jest.fn(),
}));

jest.mock('../album-cover-storage', () => ({
  cleanupSupersededAlbumCoversBestEffort: jest.fn(),
  fetchDistinctCoverBasesFromDb: jest.fn().mockResolvedValue([]),
  normalizeCoverBaseName: jest.fn((value: string) => value),
}));

import { query } from '../db';
import { handler } from '../../albums';
import { trackAssetsTableExists, tracksTableHasPipelineColumns } from '../track-pipeline-schema';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedTracksTableHasPipelineColumns = tracksTableHasPipelineColumns as jest.MockedFunction<
  typeof tracksTableHasPipelineColumns
>;
const mockedTrackAssetsTableExists = trackAssetsTableExists as jest.MockedFunction<
  typeof trackAssetsTableExists
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ALBUM_PK = '11111111-2222-4333-8444-555555555555';
const ALBUM_ID = 'test-album';

const existingAlbumRow = {
  id: ALBUM_PK,
  user_id: USER_ID,
  album_id: ALBUM_ID,
  album: 'Album Title',
  cover: 'cover-base',
  description: 'Description',
  release: { date: '2020-01-01', UPC: '123', genreCodes: ['rock'] },
  is_published: false,
  is_public: false,
  lang: 'en',
  full_name: 'Artist — Album Title',
  buttons: {},
  details: [],
};

function buildPublishPutEvent(): HandlerEvent {
  return {
    httpMethod: 'PUT',
    body: JSON.stringify({
      albumId: ALBUM_ID,
      lang: 'en',
      publish: true,
    }),
    headers: { authorization: 'Bearer test-token' },
    path: '/api/albums',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    queryStringParameters: null,
    rawUrl: '',
    rawQuery: '',
    route: null,
  } as HandlerEvent;
}

function mockExistingAlbumLookup() {
  mockedQuery.mockImplementation(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.includes('FROM albums') && normalized.includes('album_id = $1 AND lang = $2')) {
      return { rows: [existingAlbumRow] } as never;
    }

    if (normalized.includes('SELECT id FROM albums WHERE user_id = $1 AND album_id = $2')) {
      return { rows: [{ id: ALBUM_PK }] } as never;
    }

    if (normalized.includes('SELECT DISTINCT ON (t.track_id)')) {
      return {
        rows: [
          {
            track_id: 'track-1',
            visibility: 'public',
            stems_visibility: 'public',
            src: '',
            processing_status: 'pending',
          },
        ],
      } as never;
    }

    if (normalized.includes('FROM track_assets ta')) {
      return { rows: [] } as never;
    }

    if (
      normalized.includes('SELECT * FROM albums') &&
      normalized.includes('ORDER BY updated_at DESC')
    ) {
      return { rows: [existingAlbumRow] } as never;
    }

    if (normalized.includes('UPDATE albums SET') && normalized.includes('is_published')) {
      throw new Error('publish should not mutate DB when validation fails');
    }

    if (normalized.includes('FROM tracks t') && normalized.includes('WHERE t.album_id = $1')) {
      return { rows: [] } as never;
    }

    return { rows: [] } as never;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedTracksTableHasPipelineColumns.mockResolvedValue(true);
  mockedTrackAssetsTableExists.mockResolvedValue(true);
});

describe('PUT /api/albums publish readiness', () => {
  test('rejects publish when DB track is pending (server ignores stale client readiness)', async () => {
    mockExistingAlbumLookup();

    const response = await handler(buildPublishPutEvent(), {} as never);

    expect(response.statusCode).toBe(400);
    const payload = JSON.parse(response.body);
    expect(payload.error).toBe('Album is not ready to publish.');

    const updateCalls = mockedQuery.mock.calls.filter(
      ([sql]) => String(sql).includes('UPDATE albums SET') && String(sql).includes('is_published')
    );
    expect(updateCalls).toHaveLength(0);
  });

  test('allows publish when DB track is ready with playback asset', async () => {
    mockedQuery.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (
        normalized.includes('FROM albums') &&
        normalized.includes('album_id = $1 AND lang = $2')
      ) {
        return { rows: [existingAlbumRow] } as never;
      }

      if (normalized.includes('SELECT id FROM albums WHERE user_id = $1 AND album_id = $2')) {
        return { rows: [{ id: ALBUM_PK }] } as never;
      }

      if (normalized.includes('SELECT DISTINCT ON (t.track_id)')) {
        return {
          rows: [
            {
              track_id: 'track-1',
              visibility: 'public',
              stems_visibility: 'public',
              src: '',
              processing_status: 'ready',
            },
          ],
        } as never;
      }

      if (normalized.includes('FROM track_assets ta')) {
        return {
          rows: [
            {
              track_id: 'track-1',
              type: 'stream',
              format: 'opus',
              variant: '128k',
              status: 'ready',
              path: 'users/u1/audio/album/derived/stream/opus_128k/track-1.opus',
            },
          ],
        } as never;
      }

      if (
        normalized.includes('SELECT * FROM albums') &&
        normalized.includes('ORDER BY updated_at DESC')
      ) {
        return { rows: [existingAlbumRow] } as never;
      }

      if (normalized.includes('UPDATE albums SET') && normalized.includes('is_published')) {
        return { rows: [] } as never;
      }

      if (normalized.includes('FROM tracks t') && normalized.includes('WHERE t.album_id = $1')) {
        return {
          rows: [
            {
              id: 'track-pk-1',
              track_id: 'track-1',
              title: 'Track 1',
              duration: '180',
              src: '',
              content: '',
              authorship: null,
              order_index: 10,
              visibility: 'public',
              stems_visibility: 'public',
              processing_status: 'ready',
              processing_error: null,
            },
          ],
        } as never;
      }

      if (
        normalized.includes('FROM track_assets ta') &&
        normalized.includes('WHERE t.album_id = ANY')
      ) {
        return {
          rows: [
            {
              track_id: 'track-1',
              type: 'stream',
              format: 'opus',
              variant: '128k',
              status: 'ready',
              path: 'users/u1/audio/album/derived/stream/opus_128k/track-1.opus',
            },
          ],
        } as never;
      }

      if (normalized.includes('FROM synced_lyrics')) {
        return { rows: [] } as never;
      }

      return { rows: [] } as never;
    });

    const response = await handler(buildPublishPutEvent(), {} as never);

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.success).toBe(true);
    expect(payload.message).toBe('Album published successfully');

    const publishUpdate = mockedQuery.mock.calls.find(
      ([sql]) => String(sql).includes('UPDATE albums SET') && String(sql).includes('is_published')
    );
    expect(publishUpdate).toBeDefined();
  });
});
