import {
  buildAlbumStatusRedirectPath,
  buildSubscriptionSuccessRedirectPath,
  devPaymentRawMarker,
  extractReturnToFromReturnUrl,
  isDevMarkedPayment,
  isDevPaymentModeEnabled,
  logDevPaymentAlbumCreate,
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

  it('buildAlbumStatusRedirectPath includes orderId and optional returnTo', () => {
    expect(buildAlbumStatusRedirectPath('ord-1')).toBe('/pay/status?orderId=ord-1');
    expect(buildAlbumStatusRedirectPath('ord-1', '/albums/foo')).toBe(
      '/pay/status?orderId=ord-1&returnTo=%2Falbums%2Ffoo'
    );
  });

  it('buildSubscriptionSuccessRedirectPath includes subscriptionPaymentId', () => {
    expect(buildSubscriptionSuccessRedirectPath('sub-1')).toBe(
      '/pay/subscription-success?subscriptionPaymentId=sub-1'
    );
  });

  it('extractReturnToFromReturnUrl reads returnTo query param', () => {
    expect(
      extractReturnToFromReturnUrl(
        'http://localhost:8888/pay/subscription-success?returnTo=%2Fdashboard'
      )
    ).toBe('/dashboard');
    expect(extractReturnToFromReturnUrl(undefined)).toBeUndefined();
  });

  it('logDevPaymentAlbumCreate emits structured banner', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logDevPaymentAlbumCreate({
      orderId: 'ord-1',
      paymentId: 'pay-1',
      returnTo: '/home',
    });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('🧪 DEV PAYMENT MODE\nType: album\nOrder: ord-1\nPayment: pay-1')
    );
    expect(spy.mock.calls[0][0]).toContain('Redirect → /pay/status?');
    spy.mockRestore();
  });
});
