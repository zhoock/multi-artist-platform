import { describe, expect, test } from '@jest/globals';

import { shouldRefreshPublicCatalogOnAuthIdentityChange } from '../authEntitlementRefreshPolicy';

describe('shouldRefreshPublicCatalogOnAuthIdentityChange', () => {
  test('login: empty → identity refreshes', () => {
    expect(shouldRefreshPublicCatalogOnAuthIdentityChange('', 'user-1\0a@b.c')).toBe(true);
  });

  test('logout: identity → empty does not refresh', () => {
    expect(shouldRefreshPublicCatalogOnAuthIdentityChange('user-1\0a@b.c', '')).toBe(false);
  });

  test('account switch: identity A → B refreshes', () => {
    expect(shouldRefreshPublicCatalogOnAuthIdentityChange('user-1\0a@b.c', 'user-2\0x@y.z')).toBe(
      true
    );
  });

  test('no-op when key unchanged', () => {
    expect(shouldRefreshPublicCatalogOnAuthIdentityChange('user-1\0a@b.c', 'user-1\0a@b.c')).toBe(
      false
    );
  });
});
