import {
  devPaymentRawMarker,
  isDevMarkedPayment,
  isDevPaymentModeEnabled,
} from '../dev-payment-mode';

describe('dev-payment-mode', () => {
  const envKeys = ['DEV_PAYMENT_MODE', 'CONTEXT', 'NODE_ENV', 'NETLIFY_DEV'] as const;
  const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('is disabled when DEV_PAYMENT_MODE is unset', () => {
    expect(isDevPaymentModeEnabled()).toBe(false);
  });

  it('is disabled when DEV_PAYMENT_MODE is not true', () => {
    process.env.DEV_PAYMENT_MODE = 'false';
    expect(isDevPaymentModeEnabled()).toBe(false);
  });

  it('is disabled on Netlify production deploy context', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.CONTEXT = 'production';
    expect(isDevPaymentModeEnabled()).toBe(false);
  });

  it('is disabled in production Node without Netlify Dev', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NODE_ENV = 'production';
    expect(isDevPaymentModeEnabled()).toBe(false);
  });

  it('is enabled locally with DEV_PAYMENT_MODE and Netlify Dev', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NETLIFY_DEV = 'true';
    process.env.NODE_ENV = 'development';
    expect(isDevPaymentModeEnabled()).toBe(true);
  });

  it('is enabled in development Node when flag is set', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NODE_ENV = 'development';
    expect(isDevPaymentModeEnabled()).toBe(true);
  });

  it('marks and detects dev payments in raw_last_event', () => {
    const marker = devPaymentRawMarker();
    expect(marker).toEqual({ devPaymentMode: true });
    expect(isDevMarkedPayment(marker)).toBe(true);
    expect(isDevMarkedPayment({ other: true })).toBe(false);
    expect(isDevMarkedPayment(null)).toBe(false);
  });
});
