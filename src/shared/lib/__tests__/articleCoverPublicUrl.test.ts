import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { getArticleCoverPublicUrl } from '../articleCoverPublicUrl';

const TEST_USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
const SUPABASE_URL = 'https://jhpvetvfnsklpwswadle.supabase.co';
const COVER_KEY = 'article_cover_a1b2c3d4-e5f6-7890-abcd-ef1234567890_my-photo.jpg';

describe('getArticleCoverPublicUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VITE_SUPABASE_URL: SUPABASE_URL };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('builds public URL for a full filename', () => {
    expect(
      getArticleCoverPublicUrl(TEST_USER_ID, `${COVER_KEY.replace('.jpg', '')}-448.webp`)
    ).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/articles/article_cover_a1b2c3d4-e5f6-7890-abcd-ef1234567890_my-photo-448.webp`
    );
  });

  test('combines base key and suffix', () => {
    expect(
      getArticleCoverPublicUrl(
        TEST_USER_ID,
        'article_cover_a1b2c3d4-e5f6-7890-abcd-ef1234567890_my-photo.jpg',
        '-896.jpg'
      )
    ).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/articles/article_cover_a1b2c3d4-e5f6-7890-abcd-ef1234567890_my-photo-896.jpg`
    );
  });

  test('strips existing variant suffix from base key before applying suffix', () => {
    expect(getArticleCoverPublicUrl(TEST_USER_ID, 'article_cover_test-448.webp', '-128.webp')).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/articles/article_cover_test-128.webp`
    );
  });

  test('encodes spaces in file names', () => {
    expect(getArticleCoverPublicUrl(TEST_USER_ID, 'article_cover_test photo', '-448.webp')).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/articles/article_cover_test%20photo-448.webp`
    );
  });

  test('returns null without userId', () => {
    expect(getArticleCoverPublicUrl(undefined, COVER_KEY)).toBeNull();
  });

  test('accepts options object', () => {
    expect(
      getArticleCoverPublicUrl({
        userId: TEST_USER_ID,
        fileNameOrCoverKey: 'article_cover_demo',
        suffix: '-128.webp',
      })
    ).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/articles/article_cover_demo-128.webp`
    );
  });

  test('does not use proxy-image', () => {
    const url = getArticleCoverPublicUrl(TEST_USER_ID, 'article_cover_demo', '-448.webp');
    expect(url).not.toContain('proxy-image');
    expect(url).toContain('/storage/v1/object/public/');
  });
});
