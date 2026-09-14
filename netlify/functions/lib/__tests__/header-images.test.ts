import { describe, expect, test } from '@jest/globals';

import { HeaderImagesValidationError, normalizeHeaderImagesForSave } from '../header-images';

const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const HERO_PATH = `users/${OWNER_ID}/hero/hero-36924b53-1920.jpg`;
const ENCODED_HERO_PATH = encodeURIComponent(HERO_PATH);

function expectRejected(value: unknown): void {
  expect(() => normalizeHeaderImagesForSave(value, OWNER_ID)).toThrow(HeaderImagesValidationError);
}

describe('normalizeHeaderImagesForSave — accepted values', () => {
  test('keeps a canonical relative hero storage path', () => {
    expect(normalizeHeaderImagesForSave([HERO_PATH], OWNER_ID)).toEqual([HERO_PATH]);
  });

  test('normalizes a localhost dev proxy URL to the relative storage path', () => {
    const localhostUrl = `http://localhost:8080/.netlify/functions/proxy-image?path=${ENCODED_HERO_PATH}`;

    expect(normalizeHeaderImagesForSave([localhostUrl], OWNER_ID)).toEqual([HERO_PATH]);
  });

  test('normalizes a root-relative /.netlify/functions/proxy-image URL', () => {
    const url = `/.netlify/functions/proxy-image?path=${ENCODED_HERO_PATH}`;

    expect(normalizeHeaderImagesForSave([url], OWNER_ID)).toEqual([HERO_PATH]);
  });

  test('normalizes a root-relative /api/proxy-image URL', () => {
    const url = `/api/proxy-image?path=${ENCODED_HERO_PATH}`;

    expect(normalizeHeaderImagesForSave([url], OWNER_ID)).toEqual([HERO_PATH]);
  });

  test('normalizes a production absolute URL carrying a valid proxy path', () => {
    const url = `https://multi-artist-platform.netlify.app/api/proxy-image?path=${ENCODED_HERO_PATH}`;

    expect(normalizeHeaderImagesForSave([url], OWNER_ID)).toEqual([HERO_PATH]);
  });

  test('discards the origin of any host that carries a valid proxy path', () => {
    const url = `https://evil.example/api/proxy-image?path=${ENCODED_HERO_PATH}`;

    expect(normalizeHeaderImagesForSave([url], OWNER_ID)).toEqual([HERO_PATH]);
  });

  test('drops blank entries instead of storing them', () => {
    expect(normalizeHeaderImagesForSave(['   ', HERO_PATH, ''], OWNER_ID)).toEqual([HERO_PATH]);
  });

  test('accepts an empty array', () => {
    expect(normalizeHeaderImagesForSave([], OWNER_ID)).toEqual([]);
  });

  test('preserves order across mixed input forms', () => {
    const second = `users/${OWNER_ID}/hero/hero-63382ec4-1920.jpg`;

    expect(
      normalizeHeaderImagesForSave(
        [`http://localhost:8080/.netlify/functions/proxy-image?path=${ENCODED_HERO_PATH}`, second],
        OWNER_ID
      )
    ).toEqual([HERO_PATH, second]);
  });

  test('matches the owner id case-insensitively', () => {
    const path = `users/${OWNER_ID.toUpperCase()}/hero/cover-1920.jpg`;

    expect(normalizeHeaderImagesForSave([path], OWNER_ID)).toEqual([path]);
  });
});

describe('normalizeHeaderImagesForSave — rejected values', () => {
  test('rejects an ordinary external image URL', () => {
    expectRejected(['https://evil.example/image.jpg']);
  });

  test('rejects a localhost URL that is not a proxy-image path', () => {
    expectRejected(['http://localhost:8080/images/hero/2.jpg']);
  });

  test('rejects a proxy-image URL without a path parameter', () => {
    expectRejected(['/api/proxy-image?t=123']);
  });

  test('rejects a storage path owned by another user', () => {
    expectRejected([`users/${OTHER_ID}/hero/cover-1920.jpg`]);
  });

  test('rejects a proxy URL carrying another user storage path', () => {
    const path = encodeURIComponent(`users/${OTHER_ID}/hero/cover-1920.jpg`);
    expectRejected([`/api/proxy-image?path=${path}`]);
  });

  test('rejects a non-hero category for the owner', () => {
    expectRejected([`users/${OWNER_ID}/albums/album_cover-448.webp`]);
  });

  test('rejects a private category the proxy already denies', () => {
    expectRejected([`users/${OWNER_ID}/audio/album/original/track.flac`]);
  });

  test('rejects dot-dot traversal', () => {
    expectRejected([`users/${OWNER_ID}/hero/../${OTHER_ID}/audio/secret.flac`]);
  });

  test('rejects encoded traversal inside a proxy URL', () => {
    expectRejected([
      `/api/proxy-image?path=users%2F${OWNER_ID}%2Fhero%2F%2e%2e%2F${OTHER_ID}%2Faudio%2Fsecret.flac`,
    ]);
  });

  test('rejects double-encoded traversal inside a proxy URL', () => {
    expectRejected([
      `/api/proxy-image?path=users%2F${OWNER_ID}%2Fhero%2F%252e%252e%2Faudio%2Fsecret.flac`,
    ]);
  });

  test('rejects backslash separators', () => {
    expectRejected([`users\\${OWNER_ID}\\hero\\cover-1920.jpg`]);
  });

  test('rejects a NUL byte in the path', () => {
    expectRejected([`users/${OWNER_ID}/hero/cover-1920.jpg\u0000.txt`]);
  });

  test('rejects a path without a file segment', () => {
    expectRejected([`users/${OWNER_ID}/hero`]);
  });

  test('rejects a non-string entry', () => {
    expectRejected([HERO_PATH, 42]);
  });

  test('rejects a nested array entry', () => {
    expectRejected([[HERO_PATH]]);
  });

  test('rejects a null entry', () => {
    expectRejected([null]);
  });

  test('rejects a non-array headerImages value', () => {
    expectRejected(HERO_PATH);
    expectRejected(null);
    expectRejected(undefined);
    expectRejected({ 0: HERO_PATH });
  });

  test('rejects a data: URL', () => {
    expectRejected(['data:image/png;base64,iVBORw0KGgo=']);
  });

  test('rejects a javascript: URL', () => {
    expectRejected(['javascript:alert(1)']);
  });

  test('rejects a malformed URL', () => {
    expectRejected(['http://[unterminated/api/proxy-image?path=x']);
  });

  test('reports the failing index', () => {
    expect(() =>
      normalizeHeaderImagesForSave([HERO_PATH, 'https://evil.example/x.jpg'], OWNER_ID)
    ).toThrow(/headerImages\[1\]/);
  });

  test('rejects with a 400 status code', () => {
    try {
      normalizeHeaderImagesForSave(['https://evil.example/x.jpg'], OWNER_ID);
      throw new Error('expected normalizeHeaderImagesForSave to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HeaderImagesValidationError);
      expect((error as HeaderImagesValidationError).statusCode).toBe(400);
    }
  });
});
