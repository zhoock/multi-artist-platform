/**
 * POST /api/tracks/upload — storagePath ownership guard (P2 IDOR).
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

jest.mock('../email-verification', () => ({
  guardUserEmailVerifiedForUpload: jest.fn(),
}));

jest.mock('../track-pipeline-schema', () => ({
  tracksTableHasPipelineColumns: jest.fn(),
  trackAssetsTableExists: jest.fn(),
}));

import { query, getClient } from '../db';
import { guardUserEmailVerifiedForUpload } from '../email-verification';
import { tracksTableHasPipelineColumns, trackAssetsTableExists } from '../track-pipeline-schema';
import { handler } from '../../upload-tracks';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetClient = getClient as jest.MockedFunction<typeof getClient>;
const mockedGuardUserEmailVerifiedForUpload =
  guardUserEmailVerifiedForUpload as jest.MockedFunction<typeof guardUserEmailVerifiedForUpload>;
const mockedTracksTableHasPipelineColumns = tracksTableHasPipelineColumns as jest.MockedFunction<
  typeof tracksTableHasPipelineColumns
>;
const mockedTrackAssetsTableExists = trackAssetsTableExists as jest.MockedFunction<
  typeof trackAssetsTableExists
>;

const USER_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ALBUM_PK = '11111111-2222-4333-8444-555555555555';
const ALBUM_ID = 'my-album';

function buildUploadEvent(tracks: Array<Record<string, unknown>>): HandlerEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify({
      albumId: ALBUM_ID,
      lang: 'en',
      tracks,
    }),
    headers: { authorization: 'Bearer test-token' },
    path: '/api/tracks/upload',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    queryStringParameters: null,
    rawUrl: '',
    rawQuery: '',
    route: null,
  } as HandlerEvent;
}

function baseTrack(overrides: Record<string, unknown> = {}) {
  return {
    fileName: 'track.flac',
    duration: 120,
    trackId: 'track-1',
    storagePath: `users/${USER_A}/audio/${ALBUM_ID}/original/track.flac`,
    url: 'https://example.com/track.flac',
    translations: { en: { title: 'Track 1' } },
    ...overrides,
  };
}

function mockAlbumLookup() {
  mockedQuery.mockImplementation(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.includes('FROM albums WHERE album_id = $1 AND lang = $2 AND user_id = $3')) {
      return {
        rows: [{ id: ALBUM_PK, user_id: USER_A, album_id: ALBUM_ID }],
      } as never;
    }
    return { rows: [] } as never;
  });
}

function mockSuccessfulDbCommit() {
  const clientQuery = jest.fn(async (sql: string) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    if (normalized.startsWith('BEGIN') || normalized.startsWith('COMMIT')) {
      return { rows: [] } as never;
    }

    if (normalized.includes('SELECT id FROM albums WHERE id = $1 FOR UPDATE')) {
      return { rows: [{ id: ALBUM_PK }] } as never;
    }

    if (normalized.includes('COALESCE(MAX(order_index)')) {
      return { rows: [{ max_idx: '0' }] } as never;
    }

    if (normalized.includes('FROM tracks WHERE album_id = $1 AND track_id = $2')) {
      return { rows: [] } as never;
    }

    if (normalized.includes('INSERT INTO tracks')) {
      return {
        rows: [{ id: 'track-db-id', track_id: 'track-1', title: 'Track 1' }],
      } as never;
    }

    return { rows: [] } as never;
  });

  mockedGetClient.mockResolvedValue({
    query: clientQuery,
    release: jest.fn(),
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGuardUserEmailVerifiedForUpload.mockResolvedValue(null);
  mockedTracksTableHasPipelineColumns.mockResolvedValue(false);
  mockedTrackAssetsTableExists.mockResolvedValue(false);
  mockAlbumLookup();
});

describe('upload-tracks storagePath ownership', () => {
  test('rejects foreign storagePath and does not open DB transaction', async () => {
    const response = await handler(
      buildUploadEvent([
        baseTrack({
          storagePath: `users/${USER_B}/audio/${ALBUM_ID}/original/track.flac`,
        }),
      ]),
      {} as never
    );

    expect(response.statusCode).toBe(403);
    expect(mockedGetClient).not.toHaveBeenCalled();
    const payload = JSON.parse(response.body);
    expect(payload.error).toContain('another user');
  });

  test('accepts own storagePath and commits track metadata', async () => {
    mockSuccessfulDbCommit();

    const response = await handler(buildUploadEvent([baseTrack()]), {} as never);

    expect(response.statusCode).toBe(200);
    expect(mockedGetClient).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(response.body);
    expect(payload.success).toBe(true);
    expect(payload.data?.[0]?.storagePath).toBe(
      `users/${USER_A}/audio/${ALBUM_ID}/original/track.flac`
    );
  });
});
