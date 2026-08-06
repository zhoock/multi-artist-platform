import { afterEach, describe, expect, test } from '@jest/globals';

import { isDevPaymentModeClientEnabled } from '../devPaymentMode';

describe('isDevPaymentModeClientEnabled', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevPaymentMode = process.env.VITE_DEV_PAYMENT_MODE;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDevPaymentMode === undefined) {
      delete process.env.VITE_DEV_PAYMENT_MODE;
    } else {
      process.env.VITE_DEV_PAYMENT_MODE = originalDevPaymentMode;
    }
  });

  test('returns false in production even when flag is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.VITE_DEV_PAYMENT_MODE = 'true';
    expect(isDevPaymentModeClientEnabled()).toBe(false);
  });

  test('returns false in dev when flag is unset', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VITE_DEV_PAYMENT_MODE;
    expect(isDevPaymentModeClientEnabled()).toBe(false);
  });

  test('returns true in non-production when flag is true', () => {
    process.env.NODE_ENV = 'test';
    process.env.VITE_DEV_PAYMENT_MODE = 'true';
    expect(isDevPaymentModeClientEnabled()).toBe(true);
  });
});
