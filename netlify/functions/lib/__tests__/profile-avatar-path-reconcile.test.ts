import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const listMock = jest.fn<() => Promise<{ data: unknown; error: null | { message: string } }>>();

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => ({
    storage: {
      from: () => ({
        list: listMock,
      }),
    },
  })),
  STORAGE_BUCKET_NAME: 'user-media',
}));

import { query } from '../db';
import { reconcileProfileAvatarPathForUser } from '../profile-avatar-path';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('reconcileProfileAvatarPathForUser', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] } as never);
    listMock.mockReset();
  });

  test('lists profile folder, picks canonical path, persists to DB', async () => {
    const userId = '55555555-5555-4555-8555-555555555555';
    listMock.mockResolvedValue({
      data: [{ name: 'profile-cafebabe-128.webp' }, { name: 'profile-cafebabe-256.webp' }],
      error: null,
    });

    const path = await reconcileProfileAvatarPathForUser(userId);

    expect(path).toBe(`users/${userId}/profile/profile-cafebabe-128.webp`);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('profile_avatar_path'),
      [path, userId],
      0
    );
  });

  test('returns null when Storage listing is ambiguous', async () => {
    const userId = '66666666-6666-4666-8666-666666666666';
    listMock.mockResolvedValue({
      data: [
        { name: 'profile-aaa-128.webp', updated_at: '2024-01-01T00:00:00.000Z' },
        { name: 'profile-bbb-128.webp', updated_at: '2024-01-01T00:00:00.000Z' },
      ],
      error: null,
    });

    const path = await reconcileProfileAvatarPathForUser(userId);
    expect(path).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
