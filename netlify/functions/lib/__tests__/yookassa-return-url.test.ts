import { LOCAL_DEV_FRONTEND_ORIGIN } from '../public-app-url';
import {
  ALBUM_PAY_STATUS_PATH,
  resolveAlbumPaymentReturnUrl,
  resolveSubscriptionPaymentReturnUrl,
  resolveYooKassaReturnUrl,
  SUBSCRIPTION_PAY_SUCCESS_PATH,
} from '../yookassa-return-url';

describe('yookassa-return-url', () => {
  const envKeys = [
    'YOOKASSA_RETURN_URL',
    'YOOKASSA_SUBSCRIPTION_RETURN_URL',
    'PUBLIC_APP_URL',
    'NETLIFY_SITE_URL',
    'URL',
    'DEPLOY_PRIME_URL',
  ] as const;

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

  it('uses YOOKASSA_RETURN_URL when set (album)', () => {
    process.env.YOOKASSA_RETURN_URL = 'https://platform.example/pay/success';

    const url = resolveAlbumPaymentReturnUrl({ orderId: 'ord-1' });

    expect(url).toBe('https://platform.example/pay/success?orderId=ord-1');
  });

  it('falls back to getPublicAppOrigin() for album payments when env and referer are absent', () => {
    process.env.URL = 'https://multi-artist-platform.netlify.app';

    const url = resolveAlbumPaymentReturnUrl({ orderId: 'ord-2' });

    expect(url).toBe('https://multi-artist-platform.netlify.app/pay/status?orderId=ord-2');
  });

  it('uses referer origin when env is unset', () => {
    const url = resolveYooKassaReturnUrl({
      refererOrigin: 'https://multi-artist-platform.netlify.app',
      successPath: ALBUM_PAY_STATUS_PATH,
      queryParams: { orderId: 'ord-3' },
    });

    expect(url).toBe('https://multi-artist-platform.netlify.app/pay/status?orderId=ord-3');
  });

  it('prefers body returnUrl over env', () => {
    process.env.YOOKASSA_RETURN_URL = 'https://platform.example/pay/success';

    const url = resolveAlbumPaymentReturnUrl({
      requestedUrl: 'https://custom.example/after-pay',
      orderId: 'ord-4',
    });

    expect(url).toBe('https://custom.example/after-pay?orderId=ord-4');
  });

  it('uses YOOKASSA_SUBSCRIPTION_RETURN_URL for subscription checkout', () => {
    process.env.YOOKASSA_SUBSCRIPTION_RETURN_URL =
      'https://platform.example/pay/subscription-success';

    const url = resolveSubscriptionPaymentReturnUrl({ subscriptionPaymentId: 'sub-1' });

    expect(url).toBe(
      'https://platform.example/pay/subscription-success?subscriptionPaymentId=sub-1'
    );
  });

  it('falls back to YOOKASSA_RETURN_URL then getPublicAppOrigin() for subscriptions', () => {
    process.env.YOOKASSA_RETURN_URL = 'https://platform.example/pay/success';

    const fromSharedEnv = resolveSubscriptionPaymentReturnUrl({ subscriptionPaymentId: 'sub-2' });
    expect(fromSharedEnv).toBe('https://platform.example/pay/success?subscriptionPaymentId=sub-2');

    delete process.env.YOOKASSA_RETURN_URL;

    const fromOrigin = resolveSubscriptionPaymentReturnUrl({ subscriptionPaymentId: 'sub-3' });
    expect(fromOrigin).toBe(
      `${LOCAL_DEV_FRONTEND_ORIGIN}${SUBSCRIPTION_PAY_SUCCESS_PATH}?subscriptionPaymentId=sub-3`
    );
  });

  it('never emits the legacy band domain in fallback URLs', () => {
    process.env.URL = 'https://multi-artist-platform.netlify.app';

    const albumUrl = resolveAlbumPaymentReturnUrl({ orderId: 'ord-5' });
    const subscriptionUrl = resolveSubscriptionPaymentReturnUrl({ subscriptionPaymentId: 'sub-4' });

    expect(albumUrl).not.toContain('smolyanoechuchelko.ru');
    expect(subscriptionUrl).not.toContain('smolyanoechuchelko.ru');
  });
});
