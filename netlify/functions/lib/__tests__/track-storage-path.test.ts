import { describe, expect, test } from '@jest/globals';

import { assertOwnedTrackStoragePath, TrackStoragePathError } from '../track-storage-path';

const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

describe('assertOwnedTrackStoragePath', () => {
  test('allows own original master path', () => {
    const path = `users/${OWNER_ID}/audio/my-album/original/track.flac`;
    expect(assertOwnedTrackStoragePath(path, OWNER_ID)).toBe(path);
  });

  test('allows own derived stream path', () => {
    const path = `users/${OWNER_ID}/audio/my-album/derived/stream/opus_128k/track.opus`;
    expect(assertOwnedTrackStoragePath(path, OWNER_ID)).toBe(path);
  });

  test('strips leading slashes', () => {
    const path = `users/${OWNER_ID}/audio/my-album/original/track.flac`;
    expect(assertOwnedTrackStoragePath(`/${path}`, OWNER_ID)).toBe(path);
  });

  test('rejects foreign user original path', () => {
    const path = `users/${OTHER_ID}/audio/my-album/original/track.flac`;
    expect(() => assertOwnedTrackStoragePath(path, OWNER_ID)).toThrow(TrackStoragePathError);
    try {
      assertOwnedTrackStoragePath(path, OWNER_ID);
    } catch (error) {
      expect((error as TrackStoragePathError).statusCode).toBe(403);
    }
  });

  test('rejects foreign user with leading slash', () => {
    const path = `/users/${OTHER_ID}/audio/my-album/original/track.flac`;
    expect(() => assertOwnedTrackStoragePath(path, OWNER_ID)).toThrow(TrackStoragePathError);
  });

  test('rejects traversal segment', () => {
    const path = `users/${OWNER_ID}/audio/../${OTHER_ID}/audio/x/original/track.flac`;
    expect(() => assertOwnedTrackStoragePath(path, OWNER_ID)).toThrow(TrackStoragePathError);
    try {
      assertOwnedTrackStoragePath(path, OWNER_ID);
    } catch (error) {
      expect((error as TrackStoragePathError).statusCode).toBe(400);
    }
  });

  test('rejects encoded traversal', () => {
    const path = `users/${OWNER_ID}/audio/%2e%2e/${OTHER_ID}/audio/x/original/track.flac`;
    expect(() => assertOwnedTrackStoragePath(path, OWNER_ID)).toThrow(TrackStoragePathError);
  });

  test('rejects path without users prefix', () => {
    expect(() =>
      assertOwnedTrackStoragePath('audio/my-album/original/track.flac', OWNER_ID)
    ).toThrow(TrackStoragePathError);
  });

  test('rejects other namespace hero image path', () => {
    const path = `users/${OWNER_ID}/hero/cover-1920.jpg`;
    expect(() => assertOwnedTrackStoragePath(path, OWNER_ID)).toThrow(TrackStoragePathError);
  });

  test('rejects stem path without original or derived segment', () => {
    const path = `users/${OWNER_ID}/audio/my-album/track-1/stem.wav`;
    expect(() => assertOwnedTrackStoragePath(path, OWNER_ID)).toThrow(TrackStoragePathError);
  });

  test('rejects malformed empty path', () => {
    expect(() => assertOwnedTrackStoragePath('   ', OWNER_ID)).toThrow(TrackStoragePathError);
  });

  test('rejects backslash in path', () => {
    const path = `users\\${OWNER_ID}\\audio\\my-album\\original\\track.flac`;
    expect(() => assertOwnedTrackStoragePath(path, OWNER_ID)).toThrow(TrackStoragePathError);
  });
});
