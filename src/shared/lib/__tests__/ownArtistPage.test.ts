import type { AuthUser } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  fetchOwnArtistPageState,
  isDefaultHomePath,
  isOnOwnArtistOnboardingPage,
  resolveArtistOnboardingDestination,
  shouldTryArtistOnboardingRedirect,
} from '../ownArtistPage';

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer test' }),
  getUser: () => ({ id: 'user-1' }),
}));

const artistUser: AuthUser = {
  id: 'user-1',
  email: 'artist@example.com',
  name: 'Artist',
  accountType: 'artist',
  isEmailVerified: false,
  role: 'user',
};

describe('ownArtistPage helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('isDefaultHomePath detects universe home', () => {
    expect(isDefaultHomePath('/', '')).toBe(true);
    expect(isDefaultHomePath('/ru', '')).toBe(true);
    expect(isDefaultHomePath('/en', '')).toBe(true);
    expect(isDefaultHomePath('/', '?artist=slug')).toBe(false);
    expect(isDefaultHomePath('/ru', '?artist=slug')).toBe(false);
    expect(isDefaultHomePath('/dashboard/albums', '')).toBe(false);
  });

  test('isOnOwnArtistOnboardingPage matches owner slug case-insensitively', () => {
    expect(isOnOwnArtistOnboardingPage('/', '?artist=My-Artist', 'my-artist')).toBe(true);
    expect(isOnOwnArtistOnboardingPage('/ru', '?artist=My-Artist', 'my-artist')).toBe(true);
    expect(isOnOwnArtistOnboardingPage('/', '?artist=other', 'my-artist')).toBe(false);
  });

  test('shouldTryArtistOnboardingRedirect for pending registration', () => {
    expect(
      shouldTryArtistOnboardingRedirect(artistUser, {
        pendingRegistration: true,
        onDefaultHome: false,
      })
    ).toBe(true);
  });

  test('shouldTryArtistOnboardingRedirect skips unverified artist on home without pending flag', () => {
    expect(
      shouldTryArtistOnboardingRedirect(artistUser, {
        pendingRegistration: false,
        onDefaultHome: true,
      })
    ).toBe(false);
  });

  test('shouldTryArtistOnboardingRedirect skips verified artist without pending flag', () => {
    expect(
      shouldTryArtistOnboardingRedirect(
        { ...artistUser, isEmailVerified: true },
        { pendingRegistration: false, onDefaultHome: true }
      )
    ).toBe(false);
  });

  test('shouldTryArtistOnboardingRedirect skips listeners', () => {
    expect(
      shouldTryArtistOnboardingRedirect(
        { ...artistUser, accountType: 'listener' },
        { pendingRegistration: false, onDefaultHome: true }
      )
    ).toBe(false);
  });

  test('resolveArtistOnboardingDestination never sends listeners to artist home', async () => {
    await expect(
      resolveArtistOnboardingDestination('en', {
        user: { ...artistUser, accountType: 'listener' },
        defaultDestination: '/?artist=ghost',
        pendingRegistration: true,
      })
    ).resolves.toBe('/');
  });

  test('fetchOwnArtistPageState does not mark onboarding when albums request fails', async () => {
    jest.mocked(fetchWithAuthSession).mockImplementation(async (input: RequestInfo | URL) => {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.includes('user-profile')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { publicSlug: 'artist', siteName: 'Artist' },
          }),
        } as Response;
      }
      if (href.includes('/api/albums')) {
        return { ok: false, json: async () => ({}) } as Response;
      }
      if (href.includes('articles-api')) {
        return { ok: true, json: async () => [] } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    const state = await fetchOwnArtistPageState('en');
    expect(state.onboardingStateKnown).toBe(false);
    expect(state.needsOnboarding).toBe(false);
  });

  test('fetchOwnArtistPageState marks onboarding when owner truly has no content', async () => {
    jest.mocked(fetchWithAuthSession).mockImplementation(async (input: RequestInfo | URL) => {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.includes('user-profile')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { publicSlug: 'artist', siteName: 'Artist' },
          }),
        } as Response;
      }
      if (href.includes('/api/albums')) {
        return { ok: true, json: async () => ({ success: true, data: [] }) } as Response;
      }
      if (href.includes('articles-api')) {
        return { ok: true, json: async () => [] } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    const state = await fetchOwnArtistPageState('en');
    expect(state.onboardingStateKnown).toBe(true);
    expect(state.needsOnboarding).toBe(true);
  });

  test('resolveArtistOnboardingDestination keeps home when onboarding state is unknown', async () => {
    jest.mocked(fetchWithAuthSession).mockImplementation(async (input: RequestInfo | URL) => {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.includes('user-profile')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { publicSlug: 'artist', siteName: 'Artist' },
          }),
        } as Response;
      }
      if (href.includes('/api/albums')) {
        return { ok: false, json: async () => ({}) } as Response;
      }
      if (href.includes('articles-api')) {
        return { ok: true, json: async () => [] } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    await expect(
      resolveArtistOnboardingDestination('en', {
        user: artistUser,
        defaultDestination: '/en',
        pendingRegistration: true,
      })
    ).resolves.toBe('/en');
  });
});
