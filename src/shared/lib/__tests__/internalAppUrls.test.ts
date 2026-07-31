jest.mock('../publicSiteOrigin', () => ({
  buildPublicSiteUrl: (path: string) =>
    `https://example.com${path.startsWith('/') ? path : `/${path}`}`,
}));

import {
  buildAlbumPaymentDevStatusUrl,
  buildAlbumPaymentStatusReturnUrl,
  buildAuthPath,
  buildInternalAppSiteUrl,
  buildSubscriptionPaymentStatusReturnUrl,
} from '../internalAppUrls';

describe('internalAppUrls', () => {
  test('buildInternalAppSiteUrl uses public site origin', () => {
    expect(buildInternalAppSiteUrl('/pay/status')).toBe('https://example.com/pay/status');
  });

  test('buildAlbumPaymentStatusReturnUrl keeps internal path without locale prefix', () => {
    expect(buildAlbumPaymentStatusReturnUrl('/ru/albums/demo?artist=band')).toBe(
      'https://example.com/pay/status?returnTo=%2Fru%2Falbums%2Fdemo%3Fartist%3Dband'
    );
  });

  test('buildAlbumPaymentDevStatusUrl encodes order and returnTo', () => {
    expect(
      buildAlbumPaymentDevStatusUrl({
        orderId: 'ord-1',
        returnTo: '/en/albums/demo?artist=band',
      })
    ).toBe(
      'https://example.com/pay/status?orderId=ord-1&returnTo=%2Fen%2Falbums%2Fdemo%3Fartist%3Dband'
    );
  });

  test('buildSubscriptionPaymentStatusReturnUrl uses subscription success path', () => {
    expect(buildSubscriptionPaymentStatusReturnUrl('/ru/articles/post?artist=band')).toBe(
      'https://example.com/pay/subscription-success?returnTo=%2Fru%2Farticles%2Fpost%3Fartist%3Dband'
    );
  });

  test('buildAuthPath never adds locale prefix', () => {
    const params = new URLSearchParams({ mode: 'login', returnTo: '/ru/albums/x?artist=y' });
    expect(buildAuthPath(params)).toBe('/auth?mode=login&returnTo=%2Fru%2Falbums%2Fx%3Fartist%3Dy');
  });
});
