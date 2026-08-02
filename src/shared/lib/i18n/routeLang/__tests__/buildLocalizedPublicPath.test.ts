import { describe, test, expect } from '@jest/globals';

import { buildLocalizedPublicPath } from '../buildLocalizedPublicPath';
import { isInternalAppPath } from '../isInternalAppPath';

describe('buildLocalizedPublicPath', () => {
  test('delegates to withLangPrefix', () => {
    expect(buildLocalizedPublicPath('ru', '/albums')).toBe('/ru/albums');
    expect(buildLocalizedPublicPath('en', '/?artist=slug')).toBe('/en?artist=slug');
  });
});

describe('isInternalAppPath', () => {
  test('detects internal routes with or without locale prefix', () => {
    expect(isInternalAppPath('/dashboard/albums')).toBe(true);
    expect(isInternalAppPath('/ru/dashboard/albums')).toBe(true);
    expect(isInternalAppPath('/auth')).toBe(true);
    expect(isInternalAppPath('/en/auth/reset-password')).toBe(true);
    expect(isInternalAppPath('/pay/success')).toBe(true);
    expect(isInternalAppPath('/ru/pay/success')).toBe(true);
    expect(isInternalAppPath('/email-verified')).toBe(true);
    expect(isInternalAppPath('/help/articles/1')).toBe(true);
  });

  test('returns false for public localized routes', () => {
    expect(isInternalAppPath('/ru/albums')).toBe(false);
    expect(isInternalAppPath('/en/articles/post-1')).toBe(false);
    expect(isInternalAppPath('/albums')).toBe(false);
  });
});
