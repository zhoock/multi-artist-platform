/** @jest-environment jsdom */

import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders } from '@shared/lib/test-utils';
import { ToastProvider } from '@shared/lib/toast/ToastProvider';
import { PremiumSubscriptionProvider } from '@features/premiumSubscription';
import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';

const getMyArchiveMock = jest.fn<() => Promise<unknown>>();

jest.mock('@shared/lib/audio/extractAudioTechnicalMetadata', () => ({
  extractAudioTechnicalMetadata: jest.fn(),
}));

jest.mock('@shared/api/tracks', () => ({
  uploadTracks: jest.fn(),
  prepareAndUploadTrack: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  isAuthenticated: () => true,
  isEmailVerified: () => true,
  getToken: () => 'test-token',
  getUser: () => ({
    id: 'user-1',
    email: 'user@example.com',
    accountType: 'listener',
    emailVerified: true,
  }),
  getAuthHeader: () => ({ Authorization: 'Bearer test-token' }),
  clearAuth: jest.fn(),
  AUTH_SESSION_CHANGED_EVENT: 'auth:session-changed',
  subscribeAuthSession: () => () => {},
  getAuthSessionIdentityKey: () => 'user:user-1',
}));

jest.mock('@shared/lib/hooks/useAuthSessionUser', () => ({
  useAuthSessionUser: () => ({
    id: 'user-1',
    email: 'user@example.com',
    accountType: 'listener',
    emailVerified: true,
  }),
}));

jest.mock('@shared/api/archive', () => ({
  getMyArchive: () => getMyArchiveMock(),
  removeArtistFromArchiveApi: jest.fn(),
  activateArchiveArtistsApi: jest.fn(),
  ArchiveApiError: class ArchiveApiError extends Error {},
}));

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({
    open: jest.fn(),
    close: jest.fn(),
    openFromIntentResume: jest.fn(),
    requestAccess: jest.fn(),
    startCheckout: jest.fn(),
  }),
}));

jest.mock('@shared/lib/dashboardModalShellContext', () => ({
  useDashboardModalShell: () => ({ surfaceLocation: undefined }),
}));

jest.mock('@shared/lib/hooks/useOwnArtistPageSummary', () => ({
  useOwnArtistPageSummary: () => ({
    publicSlug: null,
    hasPublicReleases: false,
    hasPublicPageContent: false,
    needsOnboarding: false,
    albumsCount: 0,
    articlesCount: 0,
    profileIsEmpty: true,
    isLoading: false,
  }),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({ displayName: 'Artist' }),
}));

jest.mock('@shared/lib/hooks/useAvatar', () => ({
  useAvatar: () => ({ avatarUrl: null }),
  getProfileAvatarInitials: () => 'AB',
}));

jest.mock('../components/profile/usePublicProfilePreview', () => ({
  usePublicProfilePreview: () => ({ data: { publicSlug: null } }),
}));

jest.mock('../components/shell/DashboardLazyModals', () => ({
  DashboardLazyModals: () => null,
}));

jest.mock('../components/archive/SubscriptionContent', () => ({
  SubscriptionContent: ({ onContentReady }: { onContentReady?: () => void }) => {
    useEffect(() => {
      onContentReady?.();
    }, [onContentReady]);
    return <div data-testid="subscription-content-stub" />;
  },
}));

jest.mock('../components/archive/MyArchiveContent', () => ({
  MyArchiveContent: ({ onContentReady }: { onContentReady?: () => void }) => {
    useEffect(() => {
      onContentReady?.();
    }, [onContentReady]);
    return null;
  },
}));

jest.mock('../components/purchases/MyPurchasesContent', () => ({
  MyPurchasesContent: () => null,
}));

jest.mock('../components/settings/SettingsPageContent', () => ({
  SettingsPageContent: () => null,
}));

jest.mock('@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled', () => ({
  isSubscriptionAutoRenewClientEnabled: () => true,
}));

jest.mock('@shared/lib/subscription/useSubscriptionRebindPayment', () => ({
  useSubscriptionRebindPayment: () => ({
    startRebind: jest.fn(),
  }),
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en', setLang: jest.fn() }),
}));

jest.mock('@shared/lib/hooks/useUnsavedNavigationLeaveGuard', () => ({
  useUnsavedNavigationLeaveGuard: () => ({ state: 'unblocked' }),
}));

jest.mock('@shared/api/subscription', () => ({
  patchSubscriptionAutoRenew: jest.fn(),
  deleteSubscriptionPaymentMethod: jest.fn(),
  scheduleSubscriptionDowngrade: jest.fn(),
  cancelScheduledSubscriptionDowngrade: jest.fn(),
}));

import UserDashboard from '../UserDashboard';

function renderDashboard(initialEntries: string[] = ['/dashboard/subscription']) {
  return renderWithProviders(
    <PremiumSubscriptionProvider>
      <ToastProvider>
        <Routes>
          <Route path="/dashboard/:tab?" element={<UserDashboard />} />
        </Routes>
      </ToastProvider>
    </PremiumSubscriptionProvider>,
    { initialEntries }
  );
}

describe('UserDashboard initial focus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getMyArchiveMock.mockResolvedValue({
      isPremium: true,
      slotsUsed: 0,
      slotsLimit: 20,
      inactiveCount: 0,
      artists: [],
      billing: {
        ...EMPTY_BILLING_SNAPSHOT,
        status: 'active',
        plan: 'explorer',
        slotsLimit: 20,
        hasPremiumAccess: true,
        autoRenewEnabled: true,
        expiresAt: '2099-08-07T12:00:00.000Z',
        nextChargeAt: '2099-08-07T12:00:00.000Z',
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('focuses active nav item instead of close button on subscription reload', async () => {
    renderDashboard(['/dashboard/subscription']);

    await waitFor(() => {
      expect(screen.getByTestId('subscription-content-stub')).toBeTruthy();
    });

    act(() => {
      jest.runAllTimers();
    });

    const activeNav = document.querySelector<HTMLElement>('.user-dashboard__nav-item--active');
    const closeButton = screen.getByRole('button', { name: /close|закрыть/i });

    expect(activeNav).toBeTruthy();
    expect(activeNav).toHaveFocus();
    expect(closeButton).not.toHaveFocus();
  });
});
