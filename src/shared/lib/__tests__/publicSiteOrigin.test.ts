import {
  LEGACY_BAND_PUBLIC_DOMAIN,
  LOCAL_DEV_FRONTEND_ORIGIN,
  buildPublicAppPath,
  isLocalBackendOrigin,
  normalizeOrigin,
  resolvePublicSiteOriginFromEnv,
} from '../publicSiteOrigin';

describe('publicSiteOrigin', () => {
  const envKeys = ['PUBLIC_APP_URL', 'NETLIFY_SITE_URL', 'URL', 'DEPLOY_PRIME_URL'] as const;
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

  it('resolvePublicSiteOriginFromEnv prefers PUBLIC_APP_URL', () => {
    process.env.PUBLIC_APP_URL = 'https://multi-artist-platform.netlify.app';
    process.env.URL = 'http://localhost:8888';
    expect(resolvePublicSiteOriginFromEnv()).toBe('https://multi-artist-platform.netlify.app');
  });

  it('resolvePublicSiteOriginFromEnv skips local Netlify backend URL', () => {
    process.env.URL = 'http://localhost:8888';
    expect(resolvePublicSiteOriginFromEnv()).toBe(LOCAL_DEV_FRONTEND_ORIGIN);
  });

  it('buildPublicAppPath builds absolute URLs from env origin', () => {
    process.env.URL = 'https://multi-artist-platform.netlify.app';
    expect(buildPublicAppPath('/pay/success')).toBe(
      'https://multi-artist-platform.netlify.app/pay/success'
    );
  });

  it('buildPublicAppPath is the server-side canonical builder', () => {
    process.env.URL = 'https://multi-artist-platform.netlify.app';
    expect(buildPublicAppPath('/albums/demo')).toBe(
      'https://multi-artist-platform.netlify.app/albums/demo'
    );
  });

  it('production URLs never include legacy band domain', () => {
    process.env.URL = 'https://multi-artist-platform.netlify.app';

    const urls = [
      resolvePublicSiteOriginFromEnv(),
      buildPublicAppPath('/pay/success'),
      buildPublicAppPath('/articles/1'),
    ];

    for (const url of urls) {
      expect(url).not.toContain(LEGACY_BAND_PUBLIC_DOMAIN);
    }
  });

  it('normalizes trailing slashes and detects backend origins', () => {
    expect(normalizeOrigin('https://example.com/')).toBe('https://example.com');
    expect(isLocalBackendOrigin('http://localhost:8888')).toBe(true);
    expect(isLocalBackendOrigin('https://multi-artist-platform.netlify.app')).toBe(false);
  });
});
