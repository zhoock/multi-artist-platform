/**
 * commit-cover must reject unverified artists before cover commit mutations (P1-5 follow-up).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireAuth: jest.fn(),
    getUserIdFromEvent: jest.fn(),
  };
});

jest.mock('../email-verification', () => ({
  guardUserEmailVerifiedForUpload: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

import { requireAuth } from '../api-helpers';
import { guardUserEmailVerifiedForUpload } from '../email-verification';
import { query } from '../db';
import { createClient } from '@supabase/supabase-js';
import { handler } from '../../commit-cover';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_USER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ALBUM_ID = 'rubber-soul';
const DRAFT_KEY = `${USER_ID}/albums/${ALBUM_ID}/draft-cover`;

const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedGuardUserEmailVerifiedForUpload =
  guardUserEmailVerifiedForUpload as jest.MockedFunction<typeof guardUserEmailVerifiedForUpload>;
const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function buildPostEvent(body: Record<string, unknown>): HandlerEvent {
  return {
    httpMethod: 'POST',
    body: JSON.stringify(body),
    headers: { authorization: 'Bearer test-token' },
    path: '/api/albums/cover/commit',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    queryStringParameters: null,
    rawUrl: '',
    rawQuery: '',
    route: null,
  } as HandlerEvent;
}

function createSupabaseMock(options: {
  draftFiles?: Array<{ name: string }>;
  listError?: { message: string } | null;
}) {
  const uploaded: string[] = [];
  const removed: string[] = [];

  const supabase = {
    storage: {
      from: jest.fn(() => ({
        list: jest.fn(async () => ({
          data: options.draftFiles ?? [],
          error: options.listError ?? null,
        })),
        download: jest.fn(async () => ({
          data: {
            arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
          },
          error: null,
        })),
        upload: jest.fn(async (path: string) => {
          uploaded.push(path);
          return { error: null };
        }),
        remove: jest.fn(async (paths: string[]) => {
          removed.push(...paths);
          return { error: null };
        }),
        getPublicUrl: jest.fn((path: string) => ({
          data: { publicUrl: `https://cdn.example/${path}` },
        })),
      })),
    },
  };

  mockedCreateClient.mockReturnValue(supabase as never);

  return { uploaded, removed };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedRequireAuth.mockReturnValue(USER_ID);
  mockedQuery.mockResolvedValue({ rows: [] } as never);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

describe('commit-cover email verification guard', () => {
  test('rejects unverified artist before cover commit mutations', async () => {
    mockedGuardUserEmailVerifiedForUpload.mockResolvedValue({
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
      }),
    });

    const response = await handler(
      buildPostEvent({ draftKey: DRAFT_KEY, albumId: ALBUM_ID }),
      {} as never
    );

    expect(response.statusCode).toBe(403);
    expect(mockedGuardUserEmailVerifiedForUpload).toHaveBeenCalledWith(USER_ID);
    expect(mockedCreateClient).not.toHaveBeenCalled();
    const payload = JSON.parse(response.body);
    expect(payload.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('allows verified artist to commit an existing draft', async () => {
    mockedGuardUserEmailVerifiedForUpload.mockResolvedValue(null);
    const { uploaded } = createSupabaseMock({
      draftFiles: [{ name: 'album_cover_test_uuid_artist-Cover-album-448.webp' }],
    });

    const response = await handler(
      buildPostEvent({ draftKey: DRAFT_KEY, albumId: ALBUM_ID }),
      {} as never
    );

    expect(response.statusCode).toBe(200);
    expect(mockedGuardUserEmailVerifiedForUpload).toHaveBeenCalledWith(USER_ID);
    expect(uploaded.length).toBeGreaterThan(0);
    const payload = JSON.parse(response.body);
    expect(payload.success).toBe(true);
    expect(payload.data.baseName).toBeTruthy();
  });

  test('still rejects draft keys that do not belong to the authenticated user', async () => {
    mockedGuardUserEmailVerifiedForUpload.mockResolvedValue(null);

    const response = await handler(
      buildPostEvent({
        draftKey: `${OTHER_USER_ID}/albums/${ALBUM_ID}/draft-cover`,
        albumId: ALBUM_ID,
      }),
      {} as never
    );

    expect(response.statusCode).toBe(403);
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expect(JSON.parse(response.body).error).toMatch(/does not belong to current user/i);
  });

  test('returns draft-not-found after verification when draft folder is empty', async () => {
    mockedGuardUserEmailVerifiedForUpload.mockResolvedValue(null);
    createSupabaseMock({ draftFiles: [] });

    const response = await handler(
      buildPostEvent({ draftKey: DRAFT_KEY, albumId: ALBUM_ID }),
      {} as never
    );

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toMatch(/Draft files not found/i);
  });
});
