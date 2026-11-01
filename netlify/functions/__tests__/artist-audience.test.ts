/**
 * Handler tests for GET /api/artist-audience
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../lib/api-helpers', () => ({
  createOptionsResponse: jest.fn(() => ({ statusCode: 204 })),
  createErrorResponse: jest.fn((status: number, message: string) => ({
    statusCode: status,
    body: message,
  })),
  createSuccessResponse: jest.fn((data: unknown) => ({
    statusCode: 200,
    body: JSON.stringify(data),
  })),
  getUserIdFromEvent: jest.fn(),
  unauthorizedFromAuthHeader: jest.fn(() => ({ statusCode: 401 })),
}));

jest.mock('../lib/jwt', () => ({
  extractAccountTypeFromToken: jest.fn(),
}));

jest.mock('../lib/qualified-plays', () => ({
  parseAudiencePeriod: jest.fn((p: string) => (p === '30d' ? '30d' : null)),
  getArtistAudienceStats: jest.fn(),
}));

import { handler } from '../artist-audience';
import { getUserIdFromEvent } from '../lib/api-helpers';
import { extractAccountTypeFromToken } from '../lib/jwt';
import { getArtistAudienceStats } from '../lib/qualified-plays';

const mockedUserId = getUserIdFromEvent as jest.MockedFunction<typeof getUserIdFromEvent>;
const mockedAccountType = extractAccountTypeFromToken as jest.MockedFunction<
  typeof extractAccountTypeFromToken
>;
const mockedStats = getArtistAudienceStats as jest.MockedFunction<typeof getArtistAudienceStats>;

function makeEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    httpMethod: 'GET',
    path: '/api/artist-audience',
    headers: {},
    queryStringParameters: { period: '30d' },
    body: null,
    ...overrides,
  } as HandlerEvent;
}

beforeEach(() => {
  mockedUserId.mockReset();
  mockedAccountType.mockReset();
  mockedStats.mockReset();
});

describe('artist-audience handler', () => {
  test('rejects unauthenticated requests', async () => {
    mockedUserId.mockReturnValue(null);
    const res = await handler(makeEvent(), {} as never);
    expect(res?.statusCode).toBe(401);
  });

  test('rejects non-artist accounts', async () => {
    mockedUserId.mockReturnValue('artist-1');
    mockedAccountType.mockReturnValue('listener');
    const res = await handler(makeEvent(), {} as never);
    expect(res?.statusCode).toBe(403);
  });

  test('returns stats for authenticated artist owner', async () => {
    mockedUserId.mockReturnValue('artist-1');
    mockedAccountType.mockReturnValue('artist');
    mockedStats.mockResolvedValue({
      period: '30d',
      listeners: 1,
      plays: 2,
      regularListeners: 0,
      collectionCount: 0,
      listenersTimeline: [],
      topTracks: [],
      supporters: [],
      supportersTotal: 0,
    });

    const res = await handler(makeEvent(), {} as never);
    expect(res?.statusCode).toBe(200);
    expect(mockedStats).toHaveBeenCalledWith(
      'artist-1',
      '30d',
      expect.objectContaining({ tracksLimit: 5, supportersLimit: 5 })
    );
  });
});
