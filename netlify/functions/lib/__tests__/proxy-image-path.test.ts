import { describe, expect, test } from '@jest/globals';

import { assertPublicProxyImagePath, ProxyImagePathError } from '../proxy-image-path';

const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

describe('assertPublicProxyImagePath', () => {
  test('allows own public hero image', () => {
    const path = `users/${OWNER_ID}/hero/cover-1920.jpg`;
    expect(assertPublicProxyImagePath(path)).toBe(path);
  });

  test('allows another user public hero image', () => {
    const path = `users/${OTHER_ID}/hero/cover-1920.jpg`;
    expect(assertPublicProxyImagePath(path)).toBe(path);
  });

  test('allows album cover', () => {
    const path = `users/${OWNER_ID}/albums/album_cover-448.webp`;
    expect(assertPublicProxyImagePath(path)).toBe(path);
  });

  test('allows article cover', () => {
    const path = `users/${OWNER_ID}/articles/article_cover_demo-896.webp`;
    expect(assertPublicProxyImagePath(path)).toBe(path);
  });

  test('allows profile image', () => {
    const path = `users/${OWNER_ID}/profile/profile-128.webp`;
    expect(assertPublicProxyImagePath(path)).toBe(path);
  });

  test('allows category case variants', () => {
    const path = `users/${OWNER_ID}/Hero/cover-1920.jpg`;
    expect(assertPublicProxyImagePath(path)).toBe(path);
  });

  test('strips leading slashes', () => {
    const path = `users/${OWNER_ID}/hero/cover-1920.jpg`;
    expect(assertPublicProxyImagePath(`/${path}`)).toBe(path);
  });

  test('denies audio original master', () => {
    const path = `users/${OWNER_ID}/audio/my-album/original/track.flac`;
    expect(() => assertPublicProxyImagePath(path)).toThrow(ProxyImagePathError);
    try {
      assertPublicProxyImagePath(path);
    } catch (error) {
      expect((error as ProxyImagePathError).statusCode).toBe(403);
    }
  });

  test('denies audio derived stream', () => {
    const path = `users/${OWNER_ID}/audio/my-album/derived/stream/opus_128k/track.opus`;
    expect(() => assertPublicProxyImagePath(path)).toThrow(ProxyImagePathError);
  });

  test('denies stems under audio folder', () => {
    const path = `users/${OWNER_ID}/audio/my-album/track-1/stem.wav`;
    expect(() => assertPublicProxyImagePath(path)).toThrow(ProxyImagePathError);
  });

  test('denies unknown prefix uploads', () => {
    const path = `users/${OWNER_ID}/uploads/user_upload.jpg`;
    expect(() => assertPublicProxyImagePath(path)).toThrow(ProxyImagePathError);
  });

  test('denies unknown prefix drafts', () => {
    const path = `drafts/${OWNER_ID}/cover-preview.webp`;
    expect(() => assertPublicProxyImagePath(path)).toThrow(ProxyImagePathError);
  });

  test('denies dot-dot traversal segment', () => {
    const path = `users/${OWNER_ID}/hero/../${OTHER_ID}/audio/secret.flac`;
    expect(() => assertPublicProxyImagePath(path)).toThrow(ProxyImagePathError);
    try {
      assertPublicProxyImagePath(path);
    } catch (error) {
      expect((error as ProxyImagePathError).statusCode).toBe(400);
    }
  });

  test('denies encoded traversal', () => {
    const path = `users/${OWNER_ID}/hero/%2e%2e/${OTHER_ID}/audio/secret.flac`;
    expect(() => assertPublicProxyImagePath(path)).toThrow(ProxyImagePathError);
  });

  test('denies double-encoded traversal', () => {
    const path = `users/${OWNER_ID}/hero/%252e%252e/audio/secret.flac`;
    expect(() => assertPublicProxyImagePath(path)).toThrow(ProxyImagePathError);
  });

  test('denies backslash in path', () => {
    const path = `users\\${OWNER_ID}\\hero\\cover-1920.jpg`;
    expect(() => assertPublicProxyImagePath(path)).toThrow(ProxyImagePathError);
  });

  test('denies malformed path without file segment', () => {
    expect(() => assertPublicProxyImagePath(`users/${OWNER_ID}/hero`)).toThrow(ProxyImagePathError);
  });

  test('denies empty path', () => {
    expect(() => assertPublicProxyImagePath('   ')).toThrow(ProxyImagePathError);
  });

  test('strips cache-bust query from path before validation', () => {
    const path = `users/${OWNER_ID}/hero/cover-1920.jpg`;
    expect(assertPublicProxyImagePath(`${path}?t=123`)).toBe(path);
  });
});
