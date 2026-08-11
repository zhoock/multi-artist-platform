import { readAccountTypeFromStoredToken, type AuthUser } from '@shared/lib/auth';

export type AccountType = 'listener' | 'artist';

export const DASHBOARD_PATH = '/dashboard';

export const COLLECTION_DASHBOARD_PATH = `${DASHBOARD_PATH}/collection`;

export const SUBSCRIPTION_DASHBOARD_PATH = `${DASHBOARD_PATH}/subscription`;

export const DASHBOARD_TAB_SLUGS = [
  'albums',
  'posts',
  'payment-settings',
  'my-purchases',
  'settings',
  'social-links',
  'mixer',
  'collection',
  'subscription',
] as const;

export type DashboardTab = (typeof DASHBOARD_TAB_SLUGS)[number];

const LISTENER_TABS: DashboardTab[] = ['settings', 'my-purchases', 'collection', 'subscription'];

const ARTIST_TABS: DashboardTab[] = [
  'settings',
  'albums',
  'posts',
  'mixer',
  'collection',
  'subscription',
  'payment-settings',
  'my-purchases',
  'social-links',
];

export function isDashboardTabSlug(value: string): value is DashboardTab {
  return (DASHBOARD_TAB_SLUGS as readonly string[]).includes(value);
}

export function getAccountType(user: AuthUser | null | undefined): AccountType {
  if (user?.accountType === 'listener') return 'listener';
  if (user?.accountType === 'artist') return 'artist';
  if (user) {
    const fromToken = readAccountTypeFromStoredToken();
    if (fromToken) return fromToken;
  }
  return 'listener';
}

export function isArtistAccount(user: AuthUser | null | undefined): boolean {
  return getAccountType(user) === 'artist';
}

export function isListenerAccount(user: AuthUser | null | undefined): boolean {
  return getAccountType(user) === 'listener';
}

export function getVisibleDashboardTabs(user: AuthUser | null | undefined): DashboardTab[] {
  return isListenerAccount(user) ? LISTENER_TABS : ARTIST_TABS;
}

export function getDefaultDashboardTab(user: AuthUser | null | undefined): DashboardTab {
  return isListenerAccount(user) ? 'settings' : 'albums';
}

export function isDashboardTabAllowed(
  tab: string | undefined,
  user: AuthUser | null | undefined
): tab is DashboardTab {
  if (!tab || !isDashboardTabSlug(tab)) return false;
  return getVisibleDashboardTabs(user).includes(tab);
}

export function resolveDashboardTab(
  tab: string | undefined,
  user: AuthUser | null | undefined
): DashboardTab {
  if (tab && isDashboardTabAllowed(tab, user)) {
    return tab;
  }
  return getDefaultDashboardTab(user);
}
