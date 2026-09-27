/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

type AuthFetchModule = typeof import('@shared/lib/authFetch');
type PurchasesModule = typeof import('@shared/api/purchases');

function trackResponse(): Response {
  return {
    ok: true,
    blob: async () => new Blob(['audio-bytes'], { type: 'audio/mpeg' }),
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'audio/mpeg' : null),
    },
  } as unknown as Response;
}

function mockAuthFetchOnce(impl: AuthFetchModule['fetchWithAuthSession']) {
  jest.doMock('@shared/lib/authFetch', () => ({
    fetchWithAuthSession: jest.fn(impl),
  }));
}

function mockAuth() {
  jest.doMock('@shared/lib/auth', () => ({
    getAuthHeader: () => ({ Authorization: 'Bearer test-jwt' }),
    subscribeAuthSession: jest.fn(() => () => {}),
  }));
}

describe('downloadOwnedAlbumZipByAuth', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.URL.createObjectURL = jest.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.dontMock('@shared/lib/authFetch');
    jest.dontMock('@shared/lib/auth');
  });

  test('uses albumId + Authorization for each track (no purchase token URLs)', async () => {
    await jest.isolateModulesAsync(async () => {
      mockAuth();
      const fetchSpy: jest.MockedFunction<AuthFetchModule['fetchWithAuthSession']> = jest.fn(
        async () => trackResponse()
      );
      mockAuthFetchOnce(fetchSpy);

      const { downloadOwnedAlbumZipByAuth } = (await import(
        '@shared/api/purchases'
      )) as PurchasesModule;

      await downloadOwnedAlbumZipByAuth({
        albumId: 'my-album-slug',
        artist: 'Artist',
        album: 'Album',
        tracks: [
          { trackId: 't1', title: 'One' },
          { trackId: 't2', title: 'Two' },
        ],
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mock.calls.forEach((call) => {
        const url = call[0] as string;
        const init = call[1] as RequestInit | undefined;
        expect(url).toContain('albumId=my-album-slug');
        expect(url).toContain('track=');
        expect(url).not.toContain('token=');
        expect(init?.headers).toEqual({ Authorization: 'Bearer test-jwt' });
      });
    });
  });
});
