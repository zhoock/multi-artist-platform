import { describe, test, expect } from '@jest/globals';
import type { AuthUser } from '@shared/lib/auth';
import { resolveCheckoutBuyerIdentity } from '../resolveCheckoutBuyerIdentity';

const listener: AuthUser = {
  id: 'l1',
  email: 'fan@example.com',
  name: 'Zhuk',
  accountType: 'listener',
};

const artist: AuthUser = {
  id: 'a1',
  email: 'band@example.com',
  name: 'Смоляное чучелко',
  accountType: 'artist',
};

describe('resolveCheckoutBuyerIdentity', () => {
  test('listener shows Name label and username from profile', () => {
    const identity = resolveCheckoutBuyerIdentity(listener, 'en', 'Zhuk');
    expect(identity).toEqual({ label: 'Name', displayName: 'Zhuk' });
  });

  test('artist shows Band label and band name from profile', () => {
    const identity = resolveCheckoutBuyerIdentity(artist, 'en', 'Смоляное чучелко');
    expect(identity).toEqual({ label: 'Band', displayName: 'Смоляное чучелко' });
  });

  test('falls back to Unknown user for listener without name', () => {
    const identity = resolveCheckoutBuyerIdentity({ ...listener, name: null }, 'en', '');
    expect(identity).toEqual({ label: 'Name', displayName: 'Unknown user' });
  });

  test('falls back to Unknown band for artist without name', () => {
    const identity = resolveCheckoutBuyerIdentity({ ...artist, name: null }, 'en', '');
    expect(identity).toEqual({ label: 'Band', displayName: 'Unknown band' });
  });
});
