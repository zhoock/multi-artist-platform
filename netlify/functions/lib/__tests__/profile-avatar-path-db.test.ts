import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => null),
  STORAGE_BUCKET_NAME: 'user-media',
}));

import { query } from '../db';
import { setProfileAvatarPathForUser } from '../profile-avatar-path';

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('setProfileAvatarPathForUser', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] } as never);
  });

  test('writes canonical storage path to users.profile_avatar_path', async () => {
    const userId = '44444444-4444-4444-8444-444444444444';
    const path = `users/${userId}/profile/profile-abcd1234-128.webp`;

    await setProfileAvatarPathForUser(userId, path);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('profile_avatar_path'),
      [path, userId],
      0
    );
  });
});
