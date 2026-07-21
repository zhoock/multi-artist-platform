import type { AuthUser } from '@shared/lib/auth';
import {
  getAccountType,
  getDefaultDashboardTab,
  getVisibleDashboardTabs,
  isDashboardTabAllowed,
  resolveDashboardTab,
} from '@shared/lib/accountType';

function makeUser(accountType?: AuthUser['accountType']): AuthUser {
  return {
    id: 'u1',
    email: 'test@example.com',
    accountType,
  } as AuthUser;
}

describe('accountType dashboard helpers', () => {
  it('defaults legacy users without accountType to artist', () => {
    expect(getAccountType(makeUser(undefined))).toBe('artist');
    expect(getDefaultDashboardTab(makeUser(undefined))).toBe('albums');
  });

  it('reads listener accountType from JWT when auth_user lacks the field', () => {
    const tokenPayload = btoa(JSON.stringify({ accountType: 'listener' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const token = `header.${tokenPayload}.signature`;

    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', email: 'listener@example.com' }));

    expect(getAccountType(makeUser(undefined))).toBe('listener');

    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  });

  it('listener sees settings, purchases, and collection only', () => {
    const user = makeUser('listener');
    expect(getVisibleDashboardTabs(user)).toEqual(['settings', 'my-purchases', 'collection']);
    expect(getDefaultDashboardTab(user)).toBe('settings');
  });

  it('artist keeps full dashboard tabs', () => {
    const user = makeUser('artist');
    expect(getVisibleDashboardTabs(user)).toContain('albums');
    expect(getVisibleDashboardTabs(user)).toContain('mixer');
    expect(getDefaultDashboardTab(user)).toBe('albums');
  });

  it('resolveDashboardTab maps legacy profile slug to settings', () => {
    const listener = makeUser('listener');
    expect(resolveDashboardTab('profile', listener)).toBe('settings');
    expect(isDashboardTabAllowed('profile', listener)).toBe(true);
  });

  it('resolveDashboardTab redirects disallowed tabs to role default', () => {
    const listener = makeUser('listener');
    expect(resolveDashboardTab('albums', listener)).toBe('settings');
    expect(isDashboardTabAllowed('albums', listener)).toBe(false);
    expect(isDashboardTabAllowed('settings', listener)).toBe(true);
  });

  it('resolveDashboardTab keeps allowed tabs', () => {
    const artist = makeUser('artist');
    expect(resolveDashboardTab('mixer', artist)).toBe('mixer');
    expect(resolveDashboardTab(undefined, artist)).toBe('albums');
  });
});
