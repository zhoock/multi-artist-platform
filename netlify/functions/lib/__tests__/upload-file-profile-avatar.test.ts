import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('crypto', () => ({
  randomBytes: () => ({
    toString: () => 'deadbeef',
  }),
}));

jest.mock('../api-helpers', () => {
  const actual = jest.requireActual('../api-helpers') as typeof import('../api-helpers');
  return {
    ...actual,
    requireAuth: jest.fn(),
  };
});

jest.mock('../email-verification', () => ({
  isUserEmailVerified: jest.fn(async () => true),
}));

jest.mock('../image-processor', () => ({
  generateHeroImageVariants: jest.fn(),
  generateArticleCoverVariants: jest.fn(),
  generateProfileAvatarVariants: jest.fn(),
  extractBaseName: jest.fn(),
  ARTICLE_COVER_CACHE_CONTROL: '0',
}));

jest.mock('../profile-avatar-path', () => ({
  setProfileAvatarPathForUser: jest.fn(async () => undefined),
}));

jest.mock('../supabase', () => ({
  createSupabaseAdminClient: jest.fn(),
  STORAGE_BUCKET_NAME: 'user-media',
}));

import { requireAuth } from '../api-helpers';
import { generateProfileAvatarVariants } from '../image-processor';
import { setProfileAvatarPathForUser } from '../profile-avatar-path';
import { createSupabaseAdminClient } from '../supabase';
import { handler } from '../../upload-file';

const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockGenerateVariants = generateProfileAvatarVariants as jest.MockedFunction<
  typeof generateProfileAvatarVariants
>;
const mockSetPath = setProfileAvatarPathForUser as jest.MockedFunction<
  typeof setProfileAvatarPathForUser
>;
const mockCreateSupabase = createSupabaseAdminClient as jest.MockedFunction<
  typeof createSupabaseAdminClient
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const BASE_NAME = 'profile-deadbeef';
const CANONICAL = `${BASE_NAME}-128.webp`;

function buildProfileUploadEvent(): HandlerEvent {
  const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return {
    httpMethod: 'POST',
    body: JSON.stringify({
      fileBase64: tinyPngBase64,
      fileName: 'profile.png',
      category: 'profile',
      contentType: 'image/png',
    }),
    headers: { authorization: 'Bearer test-token' },
    path: '/api/upload-file',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    queryStringParameters: null,
    rawUrl: '/api/upload-file',
    rawQuery: '',
    route: null,
  } as HandlerEvent;
}

function mockSupabaseUpload(failFileNames: string[]) {
  const upload = jest.fn(async (_path: string, _buf: Buffer, _opts: unknown) => {
    const fileName = String(_path).split('/').pop() ?? '';
    if (failFileNames.includes(fileName)) {
      return { error: { message: `upload failed: ${fileName}` } };
    }
    return { error: null };
  });

  mockCreateSupabase.mockReturnValue({
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ error: null }),
        upload,
      }),
    },
  } as never);

  return upload;
}

describe('upload-file profile avatar canonical -128.webp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockReturnValue(USER_ID);
    mockGenerateVariants.mockResolvedValue({
      [`${BASE_NAME}-128.webp`]: Buffer.from('128'),
      [`${BASE_NAME}-256.webp`]: Buffer.from('256'),
      [`${BASE_NAME}-128.jpg`]: Buffer.from('128j'),
      [`${BASE_NAME}-256.jpg`]: Buffer.from('256j'),
    });
  });

  test('does not persist profile_avatar_path when -128.webp upload fails but -256.webp succeeds', async () => {
    mockSupabaseUpload([CANONICAL]);

    const response = await handler(buildProfileUploadEvent(), {} as never);

    expect(response.statusCode).toBe(500);
    expect(mockSetPath).not.toHaveBeenCalled();
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(String(body.error)).toContain(CANONICAL);
  });

  test('persists profile_avatar_path and returns success when -128.webp upload succeeds', async () => {
    mockSupabaseUpload([]);

    const response = await handler(buildProfileUploadEvent(), {} as never);

    expect(response.statusCode).toBe(200);
    expect(mockSetPath).toHaveBeenCalledTimes(1);
    expect(mockSetPath).toHaveBeenCalledWith(USER_ID, `users/${USER_ID}/profile/${CANONICAL}`);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.storagePath).toBe(`users/${USER_ID}/profile/${CANONICAL}`);
  });
});
