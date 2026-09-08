/**
 * P1-7 Chain 2 — commit-cover must stage NEW without deleting OLD persistent cover.
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('../email-verification', () => ({
  guardUserEmailVerifiedForUpload: jest.fn(),
}));

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../supabase', () => ({
  STORAGE_BUCKET_NAME: 'user-media',
  createSupabaseAdminClient: jest.fn(),
}));

import { requireAuth } from '../api-helpers';
import { guardUserEmailVerifiedForUpload } from '../email-verification';
import { createSupabaseAdminClient } from '../supabase';
import { handler } from '../../commit-cover';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ALBUM_ID = 'rubber-soul';
const OLD_BASE = 'album_cover_old_uuid_artist-Cover-album';
const DRAFT_KEY = `${USER_ID}/albums/${ALBUM_ID}/draft-cover`;

const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedGuard = guardUserEmailVerifiedForUpload as jest.MockedFunction<
  typeof guardUserEmailVerifiedForUpload
>;
const mockedCreateSupabaseAdminClient = createSupabaseAdminClient as jest.MockedFunction<
  typeof createSupabaseAdminClient
>;

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

type SupabaseMockOptions = {
  draftFiles: Array<{ name: string }>;
  uploadResults?: Array<{ error: { message: string } | null }>;
};

function createSupabaseMock(options: SupabaseMockOptions) {
  const uploaded: string[] = [];
  const removed: string[] = [];
  let uploadCallIndex = 0;

  const storageApi = {
    list: jest.fn(async () => ({ data: options.draftFiles, error: null })),
    download: jest.fn(async () => ({
      data: { arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer },
      error: null,
    })),
    upload: jest.fn(async (path: string) => {
      uploaded.push(path);
      const result = options.uploadResults?.[uploadCallIndex] ?? { error: null };
      uploadCallIndex += 1;
      return result;
    }),
    remove: jest.fn(async (paths: string[]) => {
      removed.push(...paths);
      return { error: null };
    }),
    getPublicUrl: jest.fn((path: string) => ({
      data: { publicUrl: `https://cdn.example/${path}` },
    })),
  };

  const supabase = {
    storage: {
      from: jest.fn(() => storageApi),
    },
  };

  mockedCreateSupabaseAdminClient.mockReturnValue(supabase as never);
  return { uploaded, removed, supabase };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedRequireAuth.mockReturnValue(USER_ID);
  mockedGuard.mockResolvedValue(null);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
});

describe('commit-cover data integrity (P1-7 Chain 2)', () => {
  test('Test 1 — stages NEW variants and deletes drafts without removing OLD persistent cover', async () => {
    const draftName = 'album_cover_new_uuid_artist-Cover-album-448.webp';
    const { uploaded, removed } = createSupabaseMock({
      draftFiles: [{ name: draftName }],
    });

    const response = await handler(
      buildPostEvent({ draftKey: DRAFT_KEY, albumId: ALBUM_ID }),
      {} as never
    );

    expect(response.statusCode).toBe(200);
    expect(uploaded.some((p) => p.includes('album_cover_new_uuid'))).toBe(true);
    expect(removed.some((p) => p.includes('drafts/'))).toBe(true);
    expect(removed.some((p) => p.includes(OLD_BASE))).toBe(false);

    const payload = JSON.parse(response.body);
    expect(payload.success).toBe(true);
    expect(payload.data.baseName).toContain('album_cover_new_uuid');
  });

  test('Test 5 — partial NEW upload failure rolls back staged files and keeps drafts', async () => {
    const files = [
      { name: 'album_cover_new_uuid_artist-Cover-album-64.webp' },
      { name: 'album_cover_new_uuid_artist-Cover-album-128.webp' },
    ];
    const { uploaded, removed } = createSupabaseMock({
      draftFiles: files,
      uploadResults: [{ error: null }, { error: { message: 'upload failed' } }],
    });

    const response = await handler(
      buildPostEvent({ draftKey: DRAFT_KEY, albumId: ALBUM_ID }),
      {} as never
    );

    expect(response.statusCode).toBe(500);
    expect(uploaded.length).toBe(2);
    expect(removed.some((p) => p.includes('album_cover_new_uuid'))).toBe(true);
    expect(removed.some((p) => p.includes('drafts/'))).toBe(false);

    const payload = JSON.parse(response.body);
    expect(payload.success).toBe(false);
  });

  test('does not call DB to look up OLD cover for deletion', async () => {
    const { query } = await import('../db');
    createSupabaseMock({
      draftFiles: [{ name: 'album_cover_new_uuid_artist-Cover-album-448.webp' }],
    });

    await handler(buildPostEvent({ draftKey: DRAFT_KEY, albumId: ALBUM_ID }), {} as never);

    expect(query).not.toHaveBeenCalled();
  });
});
