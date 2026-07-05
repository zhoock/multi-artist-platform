import { describe, expect, test } from '@jest/globals';
import type { AuthUser } from '@shared/lib/auth';

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
  test('strips artist query from home path', () => {
    expect(sanitizeListenerPostAuthDestination('/?artist=my-slug')).toBe('/');
    expect(sanitizeListenerPostAuthDestination('/en?artist=my-slug')).toBe('/en');
  });

  test('keeps non-artist-home paths', () => {
    expect(sanitizeListenerPostAuthDestination('/albums/demo?artist=foo')).toBe(
      '/albums/demo?artist=foo'
    );
    expect(sanitizeListenerPostAuthDestination('/dashboard-new/settings')).toBe(
      '/dashboard-new/settings'
    );
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
        returnToSearchParam: '/dashboard-new/articles',
        routerState: null,
      })
    ).toBe('/dashboard-new/articles');
  });
});
