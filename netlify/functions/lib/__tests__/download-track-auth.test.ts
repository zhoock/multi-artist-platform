import { describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../api-helpers', () => ({
  getUserIdFromEvent: jest.fn(() => null),
}));

jest.mock('../entitlements', () => ({
  getArtistUserIdForAlbumSlug: jest.fn(),
  getViewerEmailLower: jest.fn(),
  viewerHasPremiumAccessToArtist: jest.fn(),
}));

jest.mock('../purchase-access', () => ({
  isAlbumOwnedByUser: jest.fn(),
  isPurchaseTokenActive: jest.fn(),
}));

jest.mock('../track-storage', () => ({
  resolveTrackPublicUrl: jest.fn(),
}));

import { handler } from '../../download-track';

function getEvent(query: Record<string, string | undefined>): HandlerEvent {
  return {
    httpMethod: 'GET',
    queryStringParameters: query,
    headers: {},
    body: null,
    path: '/api/download',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: '',
    rawQuery: '',
  } as HandlerEvent;
}

describe('download-track authenticated album path', () => {
  test('rejects albumId + track without Authorization', async () => {
    const response = await handler(
      getEvent({ albumId: 'album-slug', track: 'track-1' }),
      {} as never
    );

    expect(response?.statusCode).toBe(400);
    const body = JSON.parse(response?.body ?? '{}') as { error?: string };
    expect(body.error).toMatch(/Authorization/i);
  });

  test('does not require purchase token when auth path parameters are missing', async () => {
    const response = await handler(getEvent({ track: 'track-1' }), {} as never);

    expect(response?.statusCode).toBe(400);
    const body = JSON.parse(response?.body ?? '{}') as { error?: string };
    expect(body.error).toMatch(/purchase token|albumId/i);
  });
});
