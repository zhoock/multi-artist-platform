import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { getAlbumCoverPublicUrl } from '../albumCoverPublicUrl';

const TEST_USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
const SUPABASE_URL = 'https://jhpvetvfnsklpwswadle.supabase.co';

describe('getAlbumCoverPublicUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VITE_SUPABASE_URL: SUPABASE_URL };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('builds public URL for a full filename', () => {
    expect(
      getAlbumCoverPublicUrl(TEST_USER_ID, 'smolyanoe-chuchelko-Cover-23-remastered-448.webp')
    ).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/albums/smolyanoe-chuchelko-Cover-23-remastered-448.webp`
    );
  });

  test('combines base key and suffix', () => {
    expect(
      getAlbumCoverPublicUrl(TEST_USER_ID, 'smolyanoe-chuchelko-Cover-23-remastered', '-896.jpg')
    ).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/albums/smolyanoe-chuchelko-Cover-23-remastered-896.jpg`
    );
  });

  test('uses full filename when extension is already present', () => {
    expect(getAlbumCoverPublicUrl(TEST_USER_ID, 'smolyanoe-chuchelko-Cover-23-448.webp')).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/albums/smolyanoe-chuchelko-Cover-23-448.webp`
    );
  });

  test('encodes spaces in file names', () => {
    expect(getAlbumCoverPublicUrl(TEST_USER_ID, 'Cover With Spaces', '-448.webp')).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/albums/Cover%20With%20Spaces-448.webp`
    );
  });

  test('returns null without userId', () => {
    expect(getAlbumCoverPublicUrl(undefined, 'album-448.webp')).toBeNull();
  });

  test('accepts options object', () => {
    expect(
      getAlbumCoverPublicUrl({
        userId: TEST_USER_ID,
        fileNameOrCoverKey: 'Beatles-Rubber-Soul',
        suffix: '-128.webp',
      })
    ).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/user-media/users/${TEST_USER_ID}/albums/Beatles-Rubber-Soul-128.webp`
    );
  });
});
