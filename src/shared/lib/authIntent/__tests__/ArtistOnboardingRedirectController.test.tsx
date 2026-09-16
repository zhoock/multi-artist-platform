import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { AuthUser } from '@shared/lib/auth';
import {
  FIRST_ARTIST_ONBOARDING_PENDING_KEY,
  markFirstArtistOnboardingPending,
} from '../artistOnboardingRedirect';

const mockFetchOwnArtistPageState = jest.fn<
  (lang: string) => Promise<{
    publicSlug: string | null;
    needsOnboarding: boolean;
    onboardingStateKnown: boolean;
    hasPublicPageContent: boolean;
    hasPublicReleases: boolean;
    albumsCount: number;
    articlesCount: number;
    profileIsEmpty: boolean;
  }>
>();

const mockUseAuthSessionUser = jest.fn<() => AuthUser | null>();
const mockIsAuthenticated = jest.fn<() => boolean>();
const mockShouldResumePremiumCheckoutAfterAuth = jest.fn<() => boolean>();

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useAuthSessionUser', () => ({
  useAuthSessionUser: () => mockUseAuthSessionUser(),
}));

jest.mock('@shared/lib/auth', () => ({
  isAuthenticated: () => mockIsAuthenticated(),
  AUTH_SESSION_CHANGED_EVENT: 'auth-session-changed',
}));

jest.mock('@shared/lib/ownArtistPage', () => ({
  ...jest.requireActual<typeof import('@shared/lib/ownArtistPage')>('@shared/lib/ownArtistPage'),
  fetchOwnArtistPageState: (lang: string) => mockFetchOwnArtistPageState(lang),
}));

jest.mock('../premiumCheckoutIntent', () => ({
  shouldResumePremiumCheckoutAfterAuth: () => mockShouldResumePremiumCheckoutAfterAuth(),
}));

import { ArtistOnboardingRedirectController } from '../ArtistOnboardingRedirectController';

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location" data-pathname={location.pathname} data-search={location.search} />
  );
}

const verifiedArtist: AuthUser = {
  id: 'artist-user',
  email: 'artist@example.com',
  name: 'Artist',
  accountType: 'artist',
  isEmailVerified: true,
  role: 'user',
};

describe('ArtistOnboardingRedirectController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockIsAuthenticated.mockReturnValue(true);
    mockShouldResumePremiumCheckoutAfterAuth.mockReturnValue(false);
    mockUseAuthSessionUser.mockReturnValue(verifiedArtist);
    mockFetchOwnArtistPageState.mockResolvedValue({
      publicSlug: 'artist',
      needsOnboarding: true,
      onboardingStateKnown: true,
      hasPublicPageContent: false,
      hasPublicReleases: false,
      albumsCount: 0,
      articlesCount: 0,
      profileIsEmpty: true,
    });
  });

  test('verified artist on /en does not redirect on mount (simulates reload)', async () => {
    render(
      <MemoryRouter initialEntries={['/en']}>
        <ArtistOnboardingRedirectController />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFetchOwnArtistPageState).not.toHaveBeenCalled();
    });

    const probe = document.querySelector('[data-testid="location"]');
    expect(probe?.getAttribute('data-pathname')).toBe('/en');
    expect(probe?.getAttribute('data-search')).toBe('');
  });

  test('verified artist on /en?artist=artist stays on the same URL', async () => {
    render(
      <MemoryRouter initialEntries={['/en?artist=artist']}>
        <ArtistOnboardingRedirectController />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFetchOwnArtistPageState).not.toHaveBeenCalled();
    });

    const probe = document.querySelector('[data-testid="location"]');
    expect(probe?.getAttribute('data-pathname')).toBe('/en');
    expect(probe?.getAttribute('data-search')).toBe('?artist=artist');
  });

  test('pending registration with known onboarding still redirects to owner page', async () => {
    markFirstArtistOnboardingPending(verifiedArtist.id);

    render(
      <MemoryRouter initialEntries={['/en']}>
        <ArtistOnboardingRedirectController />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      const probe = document.querySelector('[data-testid="location"]');
      expect(probe?.getAttribute('data-search')).toBe('?artist=artist');
    });

    expect(localStorage.getItem(FIRST_ARTIST_ONBOARDING_PENDING_KEY)).toBeNull();
  });

  test('does not redirect while onboarding state is unknown', async () => {
    markFirstArtistOnboardingPending(verifiedArtist.id);
    mockFetchOwnArtistPageState.mockResolvedValue({
      publicSlug: 'artist',
      needsOnboarding: false,
      onboardingStateKnown: false,
      hasPublicPageContent: false,
      hasPublicReleases: false,
      albumsCount: 0,
      articlesCount: 0,
      profileIsEmpty: true,
    });

    render(
      <MemoryRouter initialEntries={['/en']}>
        <ArtistOnboardingRedirectController />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFetchOwnArtistPageState).toHaveBeenCalled();
    });

    const probe = document.querySelector('[data-testid="location"]');
    expect(probe?.getAttribute('data-pathname')).toBe('/en');
    expect(probe?.getAttribute('data-search')).toBe('');
  });

  test('listener on home does not redirect', async () => {
    mockUseAuthSessionUser.mockReturnValue({
      ...verifiedArtist,
      accountType: 'listener',
    });

    render(
      <MemoryRouter initialEntries={['/en']}>
        <ArtistOnboardingRedirectController />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFetchOwnArtistPageState).not.toHaveBeenCalled();
    });
  });
});
