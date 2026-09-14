import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  getAuthHeader: jest.fn(() => ({})),
}));

jest.mock('@shared/model/appStore', () => ({
  getStore: () => ({ getState: () => ({}) }),
}));

jest.mock('@shared/model/currentArtist', () => ({
  selectPublicArtistSlug: () => null,
}));

import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { loadHeaderImagesFromDatabase } from '@entities/user/lib';

const mockFetch = fetchWithAuthSession as jest.MockedFunction<
  (input: string, init?: RequestInit) => Promise<Response>
>;

const CANONICAL = 'users/af97f741-1111-4222-8333-444444444444/hero/hero-36924b53-1920.jpg';
const CANONICAL_2 = 'users/af97f741-1111-4222-8333-444444444444/hero/hero-63382ec4-1920.jpg';

function mockStoredHeaderImages(headerImages: unknown[]): void {
  mockFetch.mockResolvedValue({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => ({ success: true, data: { headerImages } }),
  } as unknown as Response);
}

/** Dashboard load: authenticated, no public artist slug. */
function loadForDashboard(): Promise<string[]> {
  return loadHeaderImagesFromDatabase(true, { includeArtist: false, useAuth: true });
}

describe('loadHeaderImagesFromDatabase — Dashboard load path', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('keeps a canonical storage path byte-identical', async () => {
    mockStoredHeaderImages([CANONICAL]);

    await expect(loadForDashboard()).resolves.toEqual([CANONICAL]);
  });

  test('never prefixes an origin onto stored values', async () => {
    mockStoredHeaderImages([CANONICAL, CANONICAL_2]);

    const images = await loadForDashboard();

    // Guards the regression this fix removes: re-adding window.location.origin here would put a
    // dev/prod host back into users.header_images on the next save.
    for (const image of images) {
      expect(image).toMatch(/^users\//);
      expect(image).not.toContain('://');
      expect(image).not.toContain('localhost');
      expect(image).not.toContain('proxy-image');
    }
  });

  test('preserves order', async () => {
    mockStoredHeaderImages([CANONICAL_2, CANONICAL]);

    await expect(loadForDashboard()).resolves.toEqual([CANONICAL_2, CANONICAL]);
  });

  test('returns a legacy localhost URL untouched for the render boundary to fix', async () => {
    const legacy = `http://localhost:8080/.netlify/functions/proxy-image?path=${encodeURIComponent(CANONICAL)}`;
    mockStoredHeaderImages([legacy]);

    await expect(loadForDashboard()).resolves.toEqual([legacy]);
  });

  test('returns a legacy /api/proxy-image value untouched', async () => {
    const legacy = `/api/proxy-image?path=${encodeURIComponent(CANONICAL)}`;
    mockStoredHeaderImages([legacy]);

    await expect(loadForDashboard()).resolves.toEqual([legacy]);
  });

  test('returns a legacy bare filename untouched', async () => {
    mockStoredHeaderImages(['hero-main']);

    await expect(loadForDashboard()).resolves.toEqual(['hero-main']);
  });

  test('coerces non-string entries to strings without reshaping them', async () => {
    mockStoredHeaderImages([CANONICAL, 42]);

    await expect(loadForDashboard()).resolves.toEqual([CANONICAL, '42']);
  });

  test('returns an empty array when the response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response);

    await expect(loadForDashboard()).resolves.toEqual([]);
  });
});
