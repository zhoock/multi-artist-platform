import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

// Inlined rather than referencing OWNER_ID: jest.mock factories are hoisted above const bindings.
jest.mock('../jwt', () => ({
  classifyAuthorizationHeader: jest.fn(() => ({
    kind: 'valid',
    userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  })),
}));

import { query } from '../db';
import { handler } from '../../user-profile';

const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const HERO_PATH = `users/${OWNER_ID}/hero/hero-36924b53-1920.jpg`;
const ENCODED_HERO_PATH = encodeURIComponent(HERO_PATH);

const mockQuery = query as jest.MockedFunction<typeof query>;

function makeSaveEvent(body: Record<string, unknown>): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: '/api/user-profile',
    queryStringParameters: null,
    headers: { authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: '/api/user-profile',
    rawQuery: '',
  } as HandlerEvent;
}

/** The `header_images` JSONB parameter handed to the UPDATE, parsed back to an array. */
function savedHeaderImages(): unknown {
  const update = mockQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE users'));
  expect(update).toBeDefined();

  const sql = String(update![0]);
  const values = update![1] as unknown[];

  // Parameters are positional: find which $n carries header_images.
  const match = sql.match(/header_images = \$(\d+)::jsonb/);
  expect(match).not.toBeNull();

  return JSON.parse(String(values[Number(match![1]) - 1]));
}

describe('POST /api/user-profile — headerImages save layer', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] } as never);
  });

  test('persists a canonical relative hero path unchanged', async () => {
    const response = await handler(makeSaveEvent({ headerImages: [HERO_PATH] }), {} as never);

    expect(response?.statusCode).toBe(200);
    expect(savedHeaderImages()).toEqual([HERO_PATH]);
  });

  test('persists a localhost dev proxy URL as a relative storage path', async () => {
    const localhostUrl = `http://localhost:8080/.netlify/functions/proxy-image?path=${ENCODED_HERO_PATH}`;

    const response = await handler(makeSaveEvent({ headerImages: [localhostUrl] }), {} as never);

    expect(response?.statusCode).toBe(200);
    expect(savedHeaderImages()).toEqual([HERO_PATH]);
  });

  test('persists a production absolute proxy URL as a relative storage path', async () => {
    const prodUrl = `https://multi-artist-platform.netlify.app/api/proxy-image?path=${ENCODED_HERO_PATH}`;

    const response = await handler(makeSaveEvent({ headerImages: [prodUrl] }), {} as never);

    expect(response?.statusCode).toBe(200);
    expect(savedHeaderImages()).toEqual([HERO_PATH]);
  });

  test('never writes an origin, scheme or localhost into the column', async () => {
    const response = await handler(
      makeSaveEvent({
        headerImages: [
          `http://localhost:8080/.netlify/functions/proxy-image?path=${ENCODED_HERO_PATH}`,
          `/api/proxy-image?path=${ENCODED_HERO_PATH}`,
          HERO_PATH,
        ],
      }),
      {} as never
    );

    expect(response?.statusCode).toBe(200);

    const stored = savedHeaderImages() as string[];
    expect(stored).toEqual([HERO_PATH, HERO_PATH, HERO_PATH]);
    for (const value of stored) {
      expect(value).toMatch(/^users\//);
      expect(value).not.toContain('localhost');
      expect(value).not.toContain('http');
      expect(value).not.toContain('proxy-image');
    }
  });

  test('stores an empty array when all entries are blank', async () => {
    const response = await handler(makeSaveEvent({ headerImages: ['  ', ''] }), {} as never);

    expect(response?.statusCode).toBe(200);
    expect(savedHeaderImages()).toEqual([]);
  });

  test('rejects an external image URL without touching the database', async () => {
    const response = await handler(
      makeSaveEvent({ headerImages: ['https://evil.example/image.jpg'] }),
      {} as never
    );

    expect(response?.statusCode).toBe(400);
    expect(JSON.parse(String(response?.body)).success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('rejects another user storage path without touching the database', async () => {
    const response = await handler(
      makeSaveEvent({ headerImages: [`users/${OTHER_ID}/hero/cover-1920.jpg`] }),
      {} as never
    );

    expect(response?.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('rejects traversal without touching the database', async () => {
    const response = await handler(
      makeSaveEvent({ headerImages: [`users/${OWNER_ID}/hero/../${OTHER_ID}/audio/secret.flac`] }),
      {} as never
    );

    expect(response?.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('rejects a non-string entry without touching the database', async () => {
    const response = await handler(makeSaveEvent({ headerImages: [42] }), {} as never);

    expect(response?.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('rejects a non-array headerImages value without touching the database', async () => {
    const response = await handler(makeSaveEvent({ headerImages: HERO_PATH }), {} as never);

    expect(response?.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('leaves other profile fields untouched by the new validation', async () => {
    const response = await handler(
      makeSaveEvent({ siteName: 'New Name', theBandRu: ['Bio'] }),
      {} as never
    );

    expect(response?.statusCode).toBe(200);

    const update = mockQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE users'));
    expect(String(update?.[0])).not.toContain('header_images');
  });
});
