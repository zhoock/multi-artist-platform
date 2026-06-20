import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../entitlements', () => ({
  viewerHasPremiumAccessToArtist: jest.fn(),
}));

import { viewerHasPremiumAccessToArtist } from '../entitlements';
import {
  assertArtistUserId,
  assertSafeStemSegment,
  createStemTrackAccessToken,
  verifyStemTrackAccessToken,
  viewerCanAccessStems,
} from '../stems-access';

const mockedPremium = viewerHasPremiumAccessToArtist as jest.MockedFunction<
  typeof viewerHasPremiumAccessToArtist
>;

const ARTIST_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VIEWER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

describe('viewerCanAccessStems', () => {
  beforeEach(() => {
    mockedPremium.mockReset();
  });

  test('delegates to viewerHasPremiumAccessToArtist without extra logic', async () => {
    mockedPremium.mockResolvedValue(true);
    await expect(viewerCanAccessStems(VIEWER_ID, ARTIST_ID)).resolves.toBe(true);
    expect(mockedPremium).toHaveBeenCalledWith(VIEWER_ID, ARTIST_ID);
  });
});

describe('stem access token', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, JWT_SECRET: 'test-stem-access-secret-key-32chars!' };
  });

  afterEach(() => {
    process.env = env;
  });

  test('issues and verifies a track-scoped token', () => {
    const { token, expiresAt } = createStemTrackAccessToken(ARTIST_ID, 'album-1', 'track-1');
    expect(verifyStemTrackAccessToken(token, ARTIST_ID, 'album-1', 'track-1', expiresAt)).toBe(
      true
    );
    expect(verifyStemTrackAccessToken(token, VIEWER_ID, 'album-1', 'track-1', expiresAt)).toBe(
      false
    );
  });
});

describe('stem path params', () => {
  test('validates artistUserId and segments', () => {
    expect(assertArtistUserId(ARTIST_ID)).toBe(ARTIST_ID);
    expect(assertSafeStemSegment('my-album', 'albumId')).toBe('my-album');
    expect(() => assertArtistUserId('not-uuid')).toThrow();
    expect(() => assertSafeStemSegment('../x', 'albumId')).toThrow();
  });
});
