import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { HandlerEvent } from '@netlify/functions';

import { handler } from '../../proxy-image';

const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

const mockFetch = jest.fn<typeof fetch>();

function makeEvent(path: string): HandlerEvent {
  return {
    httpMethod: 'GET',
    path: '/api/proxy-image',
    queryStringParameters: { path },
    headers: {},
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    rawUrl: `/api/proxy-image?path=${encodeURIComponent(path)}`,
    rawQuery: `path=${encodeURIComponent(path)}`,
  } as HandlerEvent;
}

describe('proxy-image handler allowlist', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.VITE_SUPABASE_URL;

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/jpeg' : null),
      },
      blob: async () => ({
        arrayBuffer: async () => Uint8Array.from([105, 109, 97, 103, 101]).buffer,
      }),
      text: async () => '',
    } as unknown as Response);
  });

  test('proxies allowed public hero path', async () => {
    const storagePath = `users/${OWNER_ID}/hero/cover-1920.jpg`;
    const response = await handler(makeEvent(storagePath), {} as never);

    expect(response?.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('users/');
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('hero/cover-1920.jpg');
  });

  test('proxies another user public hero path', async () => {
    const storagePath = `users/${OTHER_ID}/hero/cover-1920.jpg`;
    const response = await handler(makeEvent(storagePath), {} as never);

    expect(response?.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('denies audio original without calling storage', async () => {
    const storagePath = `users/${OWNER_ID}/audio/my-album/original/track.flac`;
    const response = await handler(makeEvent(storagePath), {} as never);

    expect(response?.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('denies encoded traversal without calling storage', async () => {
    const storagePath = `users/${OWNER_ID}/hero/%2e%2e/audio/secret.flac`;
    const response = await handler(makeEvent(storagePath), {} as never);

    expect([400, 403]).toContain(response?.statusCode);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
