import { describe, expect, test } from '@jest/globals';
import { pickCanonicalProfileAvatarPathFromFiles } from '../../../../src/shared/lib/profileAvatar/pickCanonicalProfileAvatarPath';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('pickCanonicalProfileAvatarPathFromFiles', () => {
  test('prefers single profile-{hex}-128.webp', () => {
    const path = pickCanonicalProfileAvatarPathFromFiles(USER_ID, [
      { name: 'profile-abc128-128.webp' },
      { name: 'profile-abc128-256.webp' },
      { name: 'cover-hero.jpg' },
    ]);
    expect(path).toBe(`users/${USER_ID}/profile/profile-abc128-128.webp`);
  });

  test('picks newest hex128 when multiple sets exist', () => {
    const path = pickCanonicalProfileAvatarPathFromFiles(USER_ID, [
      { name: 'profile-aaa-128.webp', updated_at: '2020-01-01T00:00:00.000Z' },
      { name: 'profile-bbb-128.webp', updated_at: '2024-06-01T00:00:00.000Z' },
    ]);
    expect(path).toBe(`users/${USER_ID}/profile/profile-bbb-128.webp`);
  });

  test('returns null when multiple hex128 share the same timestamp', () => {
    const path = pickCanonicalProfileAvatarPathFromFiles(USER_ID, [
      { name: 'profile-aaa-128.webp', updated_at: '2024-06-01T00:00:00.000Z' },
      { name: 'profile-bbb-128.webp', updated_at: '2024-06-01T00:00:00.000Z' },
    ]);
    expect(path).toBeNull();
  });

  test('supports legacy profile-128.webp', () => {
    const path = pickCanonicalProfileAvatarPathFromFiles(USER_ID, [
      { name: 'profile-128.webp' },
      { name: 'profile-256.webp' },
    ]);
    expect(path).toBe(`users/${USER_ID}/profile/profile-128.webp`);
  });

  test('supports legacy single profile.jpg', () => {
    const path = pickCanonicalProfileAvatarPathFromFiles(USER_ID, [{ name: 'profile.jpg' }]);
    expect(path).toBe(`users/${USER_ID}/profile/profile.jpg`);
  });
});
