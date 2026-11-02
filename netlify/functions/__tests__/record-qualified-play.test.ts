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
    body: JSON.stringify({ success: true, data }),
  })),
  getUserIdFromEvent: jest.fn(() => null),
}));

jest.mock('../lib/ip-rate-limit', () => ({
  checkIpRateLimit: jest.fn(async () => ({ allowed: true })),
}));

jest.mock('../lib/qualified-play-rate-limit', () => ({
  checkQualifiedPlayUserRateLimit: jest.fn(async () => ({ allowed: true })),
}));

jest.mock('../lib/qualified-plays', () => ({
  registerQualifiedPlay: jest.fn(),
  isUuid: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
}));

import { handler } from '../record-qualified-play';
import { registerQualifiedPlay } from '../lib/qualified-plays';

const mockedRegister = registerQualifiedPlay as jest.MockedFunction<typeof registerQualifiedPlay>;

const SESSION = 'dddddddd-eeee-4fff-8000-111111111111';
const ANON = '00000000-0000-4000-8000-000000000077';

function makeEvent(geoHeader?: string): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: '/api/record-qualified-play',
    headers: {
      'content-type': 'application/json',
      'x-listener-anon-id': ANON,
      ...(geoHeader ? { 'x-nf-geo': geoHeader } : {}),
    },
    queryStringParameters: null,
    body: JSON.stringify({
      albumId: 'album-slug',
      trackId: '1',
      playbackSessionId: SESSION,
      durationListenedSeconds: 30,
      listenerAnonId: ANON,
    }),
    isBase64Encoded: false,
  } as HandlerEvent;
}

beforeEach(() => {
  mockedRegister.mockReset();
  mockedRegister.mockResolvedValue({ ok: true, inserted: true });
});

describe('record-qualified-play geo forwarding', () => {
  test('passes parsed city and country code to registerQualifiedPlay', async () => {
    await handler(
      makeEvent(
        JSON.stringify({
          city: 'Tokyo',
          country: { code: 'JP', name: 'Japan' },
        })
      ),
      {} as never
    );

    expect(mockedRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        listenCity: 'Tokyo',
        listenCountryCode: 'JP',
      })
    );
  });

  test('registers play when geo header is missing', async () => {
    const res = await handler(makeEvent(), {} as never);
    expect(res?.statusCode).toBe(200);
    expect(mockedRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        listenCity: null,
        listenCountryCode: null,
      })
    );
  });

  test('registers play when geo JSON is invalid', async () => {
    const res = await handler(makeEvent('{bad json'), {} as never);
    expect(res?.statusCode).toBe(200);
    expect(mockedRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        listenCity: null,
        listenCountryCode: null,
      })
    );
  });
});
