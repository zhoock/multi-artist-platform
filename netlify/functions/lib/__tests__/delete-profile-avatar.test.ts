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
  };
});

jest.mock('../profile-avatar-path', () => ({
  clearProfileAvatarPathForUser: jest.fn(async () => undefined),
}));

jest.mock('../supabase', () => ({
  createSupabaseAdminClient: jest.fn(),
  STORAGE_BUCKET_NAME: 'user-media',
}));

import { requireAuth } from '../api-helpers';
import { clearProfileAvatarPathForUser } from '../profile-avatar-path';
import { createSupabaseAdminClient } from '../supabase';
import { handler } from '../../delete-profile-avatar';

const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockClearPath = clearProfileAvatarPathForUser as jest.MockedFunction<
  typeof clearProfileAvatarPathForUser
>;
const mockCreateSupabase = createSupabaseAdminClient as jest.MockedFunction<
  typeof createSupabaseAdminClient
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function buildDeleteEvent(): HandlerEvent {
  return {
    httpMethod: 'POST',
    body: '{}',
    headers: { authorization: 'Bearer test-token' },
    path: '/api/delete-profile-avatar',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    queryStringParameters: null,
    rawUrl: '/api/delete-profile-avatar',
    rawQuery: '',
    route: null,
  } as HandlerEvent;
}

describe('delete-profile-avatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockReturnValue(USER_ID);
  });

  test('clears users.profile_avatar_path after successful Storage removal', async () => {
    mockCreateSupabase.mockReturnValue({
      storage: {
        from: () => ({
          list: async () => ({
            data: [{ name: 'profile-deadbeef-128.webp' }, { name: 'profile-deadbeef-256.webp' }],
            error: null,
          }),
          remove: async () => ({ error: null }),
        }),
      },
    } as never);

    const response = await handler(buildDeleteEvent(), {} as never);

    expect(response.statusCode).toBe(200);
    expect(mockClearPath).toHaveBeenCalledTimes(1);
    expect(mockClearPath).toHaveBeenCalledWith(USER_ID);
  });

  test('clears users.profile_avatar_path when Storage folder has no avatar files', async () => {
    mockCreateSupabase.mockReturnValue({
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
          remove: async () => ({ error: null }),
        }),
      },
    } as never);

    const response = await handler(buildDeleteEvent(), {} as never);

    expect(response.statusCode).toBe(200);
    expect(mockClearPath).toHaveBeenCalledWith(USER_ID);
  });
});
