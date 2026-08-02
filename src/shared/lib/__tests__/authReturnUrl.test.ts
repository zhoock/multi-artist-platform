import { describe, expect, test, jest } from '@jest/globals';
import type { AuthUser } from '@shared/lib/auth';

jest.mock('@shared/lib/accountDeletedSession', () => ({
  shouldForcePostAuthHome: () => false,
}));

jest.mock('@shared/lib/accountType', () => ({
  isListenerAccount: (user: AuthUser | null | undefined) => user?.accountType === 'listener',
}));

import {
  resolvePostAuthDestinationForUser,
  sanitizeListenerPostAuthDestination,
} from '../authReturnUrl';

const listener: AuthUser = {
  id: 'listener-1',
  email: 'listener@example.com',
  name: 'Listener',
  accountType: 'listener',
  isEmailVerified: false,
};

const artist: AuthUser = {
  id: 'artist-1',
  email: 'artist@example.com',
  name: 'Artist',
  accountType: 'artist',
  isEmailVerified: false,
};

describe('sanitizeListenerPostAuthDestination', () => {
  test('strips artist query from localized home paths', () => {
    expect(sanitizeListenerPostAuthDestination('/?artist=my-slug')).toBe('/');
    expect(sanitizeListenerPostAuthDestination('/en?artist=my-slug')).toBe('/en');
    expect(sanitizeListenerPostAuthDestination('/ru?artist=my-slug')).toBe('/ru');
  });

  test('keeps non-artist-home paths', () => {
    expect(sanitizeListenerPostAuthDestination('/albums/demo?artist=foo')).toBe(
      '/albums/demo?artist=foo'
    );
    expect(sanitizeListenerPostAuthDestination('/dashboard/settings')).toBe('/dashboard/settings');
  });
});

describe('resolvePostAuthDestinationForUser', () => {
  test('listener ignores returnTo artist home', () => {
    expect(
      resolvePostAuthDestinationForUser(listener, {
        returnToSearchParam: '/?artist=missing-artist',
        routerState: null,
      })
    ).toBe('/');
  });

  test('artist keeps returnTo artist home', () => {
    expect(
      resolvePostAuthDestinationForUser(artist, {
        returnToSearchParam: '/?artist=my-band',
        routerState: null,
      })
    ).toBe('/?artist=my-band');
  });

  test('defaults to home when no returnTo', () => {
    expect(
      resolvePostAuthDestinationForUser(listener, {
        returnToSearchParam: null,
        routerState: null,
      })
    ).toBe('/');
  });

  test('artist returns to dashboard tab from returnTo search param', () => {
    expect(
      resolvePostAuthDestinationForUser(artist, {
        returnToSearchParam: '/dashboard/articles',
        routerState: null,
      })
    ).toBe('/dashboard/articles');
  });
});
