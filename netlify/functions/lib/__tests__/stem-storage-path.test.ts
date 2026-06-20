import { describe, expect, test } from '@jest/globals';

import { assertOwnedStemStoragePath, StemStoragePathError } from '../stem-storage-path';

const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

describe('assertOwnedStemStoragePath', () => {
  test('allows owner to delete own stem file', () => {
    const path = `users/${OWNER_ID}/audio/my-album/track-1/stem-abc.wav`;
    expect(assertOwnedStemStoragePath(path, OWNER_ID)).toBe(path);
  });

  test('allows owner to delete own manifest', () => {
    const path = `users/${OWNER_ID}/audio/my-album/track-1/stems.json`;
    expect(assertOwnedStemStoragePath(path, OWNER_ID)).toBe(path);
  });

  test('rejects another user deleting a foreign stem path', () => {
    const path = `users/${OTHER_ID}/audio/my-album/track-1/stem-abc.wav`;
    expect(() => assertOwnedStemStoragePath(path, OWNER_ID)).toThrow(StemStoragePathError);
    try {
      assertOwnedStemStoragePath(path, OWNER_ID);
    } catch (error) {
      expect(error).toBeInstanceOf(StemStoragePathError);
      expect((error as StemStoragePathError).statusCode).toBe(403);
    }
  });

  test('rejects path traversal', () => {
    const path = `users/${OWNER_ID}/audio/../${OTHER_ID}/audio/x/y.wav`;
    expect(() => assertOwnedStemStoragePath(path, OWNER_ID)).toThrow(StemStoragePathError);
    try {
      assertOwnedStemStoragePath(path, OWNER_ID);
    } catch (error) {
      expect((error as StemStoragePathError).statusCode).toBe(400);
    }
  });

  test('rejects invalid path formats', () => {
    const invalidPaths = [
      '',
      '   ',
      'audio/file.wav',
      `users/${OWNER_ID}`,
      `users/not-a-uuid/audio/a/t/f.wav`,
      'users//audio/a/t/f.wav',
    ];

    for (const path of invalidPaths) {
      expect(() => assertOwnedStemStoragePath(path, OWNER_ID)).toThrow(StemStoragePathError);
    }
  });

  test('strips leading slashes before validation', () => {
    const path = `users/${OWNER_ID}/audio/album/track/stem.wav`;
    expect(assertOwnedStemStoragePath(`/${path}`, OWNER_ID)).toBe(path);
  });
});
