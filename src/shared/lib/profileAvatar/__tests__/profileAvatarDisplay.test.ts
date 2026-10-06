import { describe, expect, test } from '@jest/globals';
import { profileAvatarPathToDisplayUrl } from '@shared/lib/profileAvatar';

describe('profileAvatarPathToDisplayUrl', () => {
  test('builds proxy URL from storage path', () => {
    const url = profileAvatarPathToDisplayUrl('users/u1/profile/profile-abcd-128.webp');
    expect(url).toContain('proxy-image');
    expect(url).toContain(encodeURIComponent('users/u1/profile/profile-abcd-128.webp'));
  });

  test('returns empty for invalid path', () => {
    expect(profileAvatarPathToDisplayUrl(null)).toBe('');
    expect(profileAvatarPathToDisplayUrl('users/u1/hero/cover.jpg')).toBe('');
  });
});
