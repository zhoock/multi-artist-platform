import { readAccountTypeFromStoredToken, type AuthUser } from '@shared/lib/auth';

export type AccountType = 'listener' | 'artist';

export const COLLECTION_DASHBOARD_PATH = '/dashboard-new/collection';

export const DASHBOARD_TAB_SLUGS = [
  'albums',
  'posts',
  'payment-settings',
  'my-purchases',
  'settings',
  'social-links',
  'mixer',
  'collection',
] as const;

export type DashboardTab = (typeof DASHBOARD_TAB_SLUGS)[number];

const LISTENER_TABS: DashboardTab[] = ['settings', 'my-purchases', 'collection'];

const ARTIST_TABS: DashboardTab[] = [
  'settings',
  'albums',
  'posts',
  'mixer',
  'collection',
  'payment-settings',
  'my-purchases',
  'social-links',
];

/** Legacy dashboard tab slugs before rename (profile → settings, archive → collection). */
export function normalizeLegacyDashboardTabSlug(tab: string | undefined): string | undefined {
  if (tab === 'profile') return 'settings';
  if (tab === 'archive') return 'collection';
  return tab;
}

export function isDashboardTabSlug(value: string): value is DashboardTab {
  const normalized = normalizeLegacyDashboardTabSlug(value);
  return (
    normalized !== undefined && (DASHBOARD_TAB_SLUGS as readonly string[]).includes(normalized)
  );
}

/** Legacy sessions without accountType are treated as artist (existing CMS users). */
export function getAccountType(user: AuthUser | null | undefined): AccountType {
  if (user?.accountType === 'listener') return 'listener';
  if (user?.accountType === 'artist') return 'artist';
  if (user) {
    const fromToken = readAccountTypeFromStoredToken();
    if (fromToken) return fromToken;
  }
  return 'artist';
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
  const normalizedTab = normalizeLegacyDashboardTabSlug(tab);
  if (!normalizedTab || !isDashboardTabSlug(normalizedTab)) return false;
  return getVisibleDashboardTabs(user).includes(normalizedTab as DashboardTab);
}

export function resolveDashboardTab(
  tab: string | undefined,
  user: AuthUser | null | undefined
): DashboardTab {
  const normalizedTab = normalizeLegacyDashboardTabSlug(tab);
  if (normalizedTab && isDashboardTabAllowed(normalizedTab, user)) {
    return normalizedTab as DashboardTab;
  }
  return getDefaultDashboardTab(user);
}
