import type { Location } from 'react-router-dom';

import { buildSessionExpiredAuthTarget } from '../sessionExpiredNavigation';

function makeLocation(pathname: string, search = '', hash = ''): Location {
  return {
    pathname,
    search,
    hash,
    state: null,
    key: 'test',
  };
}

describe('buildSessionExpiredAuthTarget', () => {
  test('preserves public page as background and returnTo', () => {
    const current = makeLocation('/albums/rubber-soul', '?artist=beatles');
    const target = buildSessionExpiredAuthTarget(current);

    expect(target.returnTo).toBe('/albums/rubber-soul?artist=beatles');
    expect(target.backgroundLocation).toBe(current);
  });

  test('uses dashboard location as background so UserDashboard stays mounted', () => {
    const nestedBg = makeLocation('/', '?artist=beatles');
    const current: Location = {
      pathname: '/dashboard/albums',
      search: '',
      hash: '',
      state: { backgroundLocation: nestedBg },
      key: 'dashboard',
    };

    const target = buildSessionExpiredAuthTarget(current);

    expect(target.returnTo).toBe('/dashboard/albums');
    expect(target.backgroundLocation).toBe(current);
    expect(target.backgroundLocation.state).toEqual({ backgroundLocation: nestedBg });
  });

  test('preserves dashboard articles tab for unauthenticated deep link', () => {
    const current = makeLocation('/dashboard/articles');
    const target = buildSessionExpiredAuthTarget(current);

    expect(target.returnTo).toBe('/dashboard/articles');
    expect(target.backgroundLocation.pathname).toBe('/dashboard/articles');
  });

  test('strips unsafe return paths', () => {
    const current = makeLocation('/auth', '?mode=login');
    const target = buildSessionExpiredAuthTarget(current);

    expect(target.returnTo).toBe('/');
  });
});
