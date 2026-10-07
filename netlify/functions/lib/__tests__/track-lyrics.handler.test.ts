import type { HandlerEvent } from '@netlify/functions';

const getUserIdFromEvent = jest.fn();
const resolvePublicArtistUserId = jest.fn();
const assertArtistVisibleToViewer = jest.fn();
const viewerHasPremiumAccessToArtist = jest.fn();
const artistHasMonetizationEnabled = jest.fn();
const buildTrackLyricsBundle = jest.fn();

jest.mock('../api-helpers', () => ({
  getUserIdFromEvent: (...args: unknown[]) => getUserIdFromEvent(...args),
  unauthorizedFromAuthHeader: () => ({
    statusCode: 401,
    headers: {},
    body: JSON.stringify({ success: false }),
  }),
}));

jest.mock('../public-artist-resolver', () => ({
  PublicArtistResolverError: class PublicArtistResolverError extends Error {
    statusCode = 404;
  },
  resolvePublicArtistUserId: (...args: unknown[]) => resolvePublicArtistUserId(...args),
}));

jest.mock('../artist-publication', () => ({
  assertArtistVisibleToViewer: (...args: unknown[]) => assertArtistVisibleToViewer(...args),
}));

jest.mock('../entitlements', () => ({
  viewerHasPremiumAccessToArtist: (...args: unknown[]) => viewerHasPremiumAccessToArtist(...args),
}));

jest.mock('../artist-monetization', () => ({
  artistHasMonetizationEnabled: (...args: unknown[]) => artistHasMonetizationEnabled(...args),
}));

jest.mock('../track-lyrics', () => ({
  buildTrackLyricsBundle: (...args: unknown[]) => buildTrackLyricsBundle(...args),
  deleteTrackLyricsSync: jest.fn(),
  saveTrackLyricsContent: jest.fn(),
  saveTrackLyricsSync: jest.fn(),
}));

import { handler } from '../../track-lyrics';

const syncedBundle = {
  albumId: 'album-1',
  trackId: 'track-1',
  lang: 'ru',
  content: 'Line',
  syncedLines: [{ text: 'Line', startTime: 1 }],
  state: 'synced' as const,
  syncedAt: '2026-01-01T00:00:00.000Z',
};

function getEvent(authUserId: string | null): HandlerEvent {
  getUserIdFromEvent.mockReturnValue(authUserId);
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {
      albumId: 'album-1',
      trackId: 'track-1',
      lang: 'ru',
      artist: 'the-artist',
    },
  } as HandlerEvent;
}

describe('GET /api/track-lyrics read path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolvePublicArtistUserId.mockResolvedValue('artist-user');
    assertArtistVisibleToViewer.mockResolvedValue(undefined);
    artistHasMonetizationEnabled.mockResolvedValue(true);
    viewerHasPremiumAccessToArtist.mockResolvedValue(false);
    buildTrackLyricsBundle.mockResolvedValue(syncedBundle);
  });

  test('owner receives the real bundle even when premium check is false', async () => {
    const response = await handler(getEvent('artist-user'), {} as never);
    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(response?.body ?? '{}')).toEqual({
      success: true,
      data: syncedBundle,
    });
    expect(buildTrackLyricsBundle).toHaveBeenCalled();
  });

  test('public viewer receives lyrics bundle (same as album page embed)', async () => {
    const response = await handler(getEvent(null), {} as never);
    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(response?.body ?? '{}')).toEqual({
      success: true,
      data: syncedBundle,
    });
    expect(buildTrackLyricsBundle).toHaveBeenCalled();
  });

  test('missing lyrics is 404, not an empty success payload', async () => {
    viewerHasPremiumAccessToArtist.mockResolvedValue(true);
    buildTrackLyricsBundle.mockResolvedValue(null);
    const response = await handler(getEvent('listener'), {} as never);
    expect(response?.statusCode).toBe(404);
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ success: false });
  });
});
