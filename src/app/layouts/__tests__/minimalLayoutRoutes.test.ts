import { describe, test, expect } from '@jest/globals';

import { isMinimalLayoutPathname } from '../minimalLayoutRoutes';

describe('isMinimalLayoutPathname', () => {
  test('matches standalone service routes', () => {
    expect(isMinimalLayoutPathname('/email-verified')).toBe(true);
    expect(isMinimalLayoutPathname('/email-verification-expired')).toBe(true);
    expect(isMinimalLayoutPathname('/auth/reset-password')).toBe(true);
  });

  test('matches prefixed variants before redirect', () => {
    expect(isMinimalLayoutPathname('/ru/email-verified')).toBe(true);
    expect(isMinimalLayoutPathname('/en/auth/reset-password')).toBe(true);
  });

  test('does not match auth overlay or other app routes', () => {
    expect(isMinimalLayoutPathname('/auth')).toBe(false);
    expect(isMinimalLayoutPathname('/dashboard-new')).toBe(false);
    expect(isMinimalLayoutPathname('/pay/success')).toBe(false);
    expect(isMinimalLayoutPathname('/albums')).toBe(false);
    expect(isMinimalLayoutPathname('/unknown')).toBe(false);
  });
});
