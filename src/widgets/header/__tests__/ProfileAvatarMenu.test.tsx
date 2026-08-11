/** @jest-environment jsdom */

/// <reference types="@testing-library/jest-dom" />

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';
import { renderWithProviders } from '@shared/lib/test-utils';
import { COLLECTION_DASHBOARD_PATH, SUBSCRIPTION_DASHBOARD_PATH } from '@shared/lib/accountType';

import { ProfileAvatarMenu } from '../ui/ProfileAvatarMenu';

const openPremiumModalMock = jest.fn();

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({
    open: openPremiumModalMock,
    close: jest.fn(),
    openFromIntentResume: jest.fn(),
    requestAccess: jest.fn(),
    startCheckout: jest.fn(),
  }),
}));

jest.mock('@shared/lib/hooks/useAvatar', () => ({
  useStoredProfileAvatarUrl: () => 'https://example.com/avatar.jpg',
  getProfileAvatarInitials: () => 'AB',
}));

jest.mock('@shared/lib/avatarUpload', () => ({
  isProfileAvatarPlaceholderUrl: () => false,
}));

jest.mock('@shared/lib/ownArtistPage', () => ({
  openOwnArtistPage: jest.fn(),
}));

jest.mock('@shared/lib/auth', () => ({
  clearAuth: jest.fn(),
}));

jest.mock('@shared/lib/hooks/useOwnArtistPageSummary', () => ({
  useOwnArtistPageSummary: jest.fn(),
}));

jest.mock('@features/premiumSubscription', () => ({
  usePremiumSubscription: jest.fn(),
}));

import { usePremiumSubscription } from '@features/premiumSubscription';
import { useOwnArtistPageSummary } from '@shared/lib/hooks/useOwnArtistPageSummary';

const premiumMock = jest.mocked(usePremiumSubscription);
const ownArtistPageMock = jest.mocked(useOwnArtistPageSummary);

function renderMenu(initialEntries: string[] = ['/']) {
  return renderWithProviders(<ProfileAvatarMenu />, {
    initialEntries,
    preloadedState: {
      lang: { current: 'en' },
    },
  });
}

async function openProfileMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /account menu/i }));
  return screen.getByRole('menu', { name: /account/i });
}

function menuItem(menu: HTMLElement, name: string | RegExp) {
  return within(menu).getByRole('menuitem', { name });
}

describe('ProfileAvatarMenu dashboard links', () => {
  beforeEach(() => {
    cleanup();
    openPremiumModalMock.mockReset();
    ownArtistPageMock.mockReturnValue({
      publicSlug: null,
      hasPublicPageContent: false,
    });
  });

  test('shows Subscription link to /dashboard/subscription for active subscribers', async () => {
    const user = userEvent.setup();
    premiumMock.mockReturnValue({
      isPremium: true,
      planSlug: 'explorer',
      slotsUsed: 1,
      slotsLimit: 3,
      billing: { ...EMPTY_BILLING_SNAPSHOT, hasPremiumAccess: true, status: 'active' },
      loading: false,
      refetch: async () => {},
    });

    renderMenu();
    const menu = await openProfileMenu(user);

    expect(menuItem(menu, 'Subscription')).toHaveAttribute('href', SUBSCRIPTION_DASHBOARD_PATH);
    expect(menuItem(menu, /Your Collection/)).toHaveAttribute('href', COLLECTION_DASHBOARD_PATH);
    expect(within(menu).queryByRole('menuitem', { name: 'Choose Plan' })).toBeNull();
  });

  test('shows Subscription link for users without an active plan', async () => {
    const user = userEvent.setup();
    premiumMock.mockReturnValue({
      isPremium: false,
      planSlug: null,
      slotsUsed: 0,
      slotsLimit: 3,
      billing: EMPTY_BILLING_SNAPSHOT,
      loading: false,
      refetch: async () => {},
    });

    renderMenu();
    const menu = await openProfileMenu(user);

    expect(menuItem(menu, 'Subscription')).toHaveAttribute('href', SUBSCRIPTION_DASHBOARD_PATH);
    expect(within(menu).queryByRole('menuitem', { name: 'Your Collection' })).toBeNull();
    expect(menuItem(menu, 'Choose Plan')).toBeTruthy();
  });

  test('shows Subscription for expired billing state', async () => {
    const user = userEvent.setup();
    premiumMock.mockReturnValue({
      isPremium: false,
      planSlug: 'explorer',
      slotsUsed: 1,
      slotsLimit: 3,
      billing: { ...EMPTY_BILLING_SNAPSHOT, hasPremiumAccess: false, status: 'expired' },
      loading: false,
      refetch: async () => {},
    });

    renderMenu();
    const menu = await openProfileMenu(user);
    expect(menuItem(menu, 'Subscription')).toHaveAttribute('href', SUBSCRIPTION_DASHBOARD_PATH);
    expect(menuItem(menu, /Your Collection/)).toHaveAttribute('href', COLLECTION_DASHBOARD_PATH);
  });

  test('shows Subscription for past_due billing state', async () => {
    const user = userEvent.setup();
    premiumMock.mockReturnValue({
      isPremium: false,
      planSlug: 'explorer',
      slotsUsed: 1,
      slotsLimit: 3,
      billing: { ...EMPTY_BILLING_SNAPSHOT, hasPremiumAccess: false, status: 'past_due' },
      loading: false,
      refetch: async () => {},
    });

    renderMenu();
    const menu = await openProfileMenu(user);
    expect(menuItem(menu, 'Subscription')).toHaveAttribute('href', SUBSCRIPTION_DASHBOARD_PATH);
    expect(menuItem(menu, /Your Collection/)).toHaveAttribute('href', COLLECTION_DASHBOARD_PATH);
  });

  test('marks Subscription active on /dashboard/subscription', async () => {
    const user = userEvent.setup();
    premiumMock.mockReturnValue({
      isPremium: true,
      planSlug: 'explorer',
      slotsUsed: 1,
      slotsLimit: 3,
      billing: { ...EMPTY_BILLING_SNAPSHOT, hasPremiumAccess: true, status: 'active' },
      loading: false,
      refetch: async () => {},
    });

    renderMenu(['/dashboard/subscription']);
    const menu = await openProfileMenu(user);

    expect(menuItem(menu, 'Subscription')).toHaveAttribute('aria-current', 'page');
    expect(menuItem(menu, /Your Collection/)).not.toHaveAttribute('aria-current', 'page');
  });

  test('marks Collection active on /dashboard/collection only', async () => {
    const user = userEvent.setup();
    premiumMock.mockReturnValue({
      isPremium: true,
      planSlug: 'explorer',
      slotsUsed: 1,
      slotsLimit: 3,
      billing: { ...EMPTY_BILLING_SNAPSHOT, hasPremiumAccess: true, status: 'active' },
      loading: false,
      refetch: async () => {},
    });

    renderMenu(['/dashboard/collection']);
    const menu = await openProfileMenu(user);

    expect(menuItem(menu, /Your Collection/)).toHaveAttribute('aria-current', 'page');
    expect(menuItem(menu, 'Subscription')).not.toHaveAttribute('aria-current', 'page');
  });
});
