import {
  LOCAL_DEV_FRONTEND_ORIGIN,
  buildEmailVerificationUrl,
  buildPublicAlbumEmailUrl,
  buildPublicAppPath,
  getPublicAppOrigin,
  isLocalBackendOrigin,
  normalizeOrigin,
} from '../public-app-url';

describe('public-app-url', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.PUBLIC_APP_URL;
    delete process.env.NETLIFY_SITE_URL;
    delete process.env.URL;
    delete process.env.DEPLOY_PRIME_URL;
  });

  afterAll(() => {
    process.env = env;
  });

  it('maps local Netlify backend URL to frontend dev origin', () => {
    process.env.URL = 'http://localhost:8888';
    expect(getPublicAppOrigin()).toBe(LOCAL_DEV_FRONTEND_ORIGIN);
  });

  it('prefers PUBLIC_APP_URL over local backend URL', () => {
    process.env.PUBLIC_APP_URL = 'http://localhost:8080';
    process.env.URL = 'http://localhost:8888';
    expect(getPublicAppOrigin()).toBe('http://localhost:8080');
  });

  it('uses NETLIFY_SITE_URL when it is a public production URL', () => {
    process.env.NETLIFY_SITE_URL = 'https://multi-artist-platform.netlify.app';
    process.env.URL = 'http://localhost:8888';
    expect(getPublicAppOrigin()).toBe('https://multi-artist-platform.netlify.app');
  });

  it('builds verify-email links on the public app origin', () => {
    process.env.URL = 'http://localhost:8888';
    expect(buildEmailVerificationUrl('abc123')).toBe(
      'http://localhost:8080/api/auth/verify-email?token=abc123'
    );
  });

  it('builds post-verify redirect paths on the public app origin', () => {
    process.env.URL = 'http://localhost:8888';
    expect(buildPublicAppPath('/email-verified')).toBe('http://localhost:8080/email-verified');
    expect(buildPublicAppPath('email-verification-expired?reason=expired')).toBe(
      'http://localhost:8080/email-verification-expired?reason=expired'
    );
  });

  it('detects local backend origins', () => {
    expect(isLocalBackendOrigin('http://localhost:8888')).toBe(true);
    expect(isLocalBackendOrigin('http://127.0.0.1:8888')).toBe(true);
    expect(isLocalBackendOrigin('http://localhost:8080')).toBe(false);
    expect(isLocalBackendOrigin('https://smolyanoechuchelko.ru')).toBe(false);
  });

  it('normalizes trailing slashes', () => {
    expect(normalizeOrigin('https://example.com/')).toBe('https://example.com');
  });

  it('builds localized public album URLs for purchase emails', () => {
    process.env.URL = 'https://multi-artist-platform.netlify.app';

    expect(
      buildPublicAlbumEmailUrl({
        albumLang: 'ru',
        albumSlug: 'rubber-soul',
        artistPublicSlug: 'the-beatles',
      })
    ).toBe('https://multi-artist-platform.netlify.app/ru/albums/rubber-soul?artist=the-beatles');

    expect(
      buildPublicAlbumEmailUrl({
        albumLang: 'en',
        albumSlug: 'rubber-soul',
        artistPublicSlug: 'the-beatles',
      })
    ).toBe('https://multi-artist-platform.netlify.app/en/albums/rubber-soul?artist=the-beatles');
  });

  it('defaults unknown album lang to ru for email album links', () => {
    process.env.URL = 'https://example.com';
    expect(
      buildPublicAlbumEmailUrl({
        albumLang: 'de',
        albumSlug: 'sample',
      })
    ).toBe('https://example.com/ru/albums/sample');
  });
});
