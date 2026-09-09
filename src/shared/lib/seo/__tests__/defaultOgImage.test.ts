import { DEFAULT_OG_IMAGE_PATH, buildDefaultOgImageUrl } from '../defaultOgImage';

jest.mock('../../publicSiteOrigin', () => ({
  buildPublicSiteUrl: (path: string) => `https://example.com${path}`,
}));

describe('defaultOgImage', () => {
  it('uses the shared platform OG asset path', () => {
    expect(DEFAULT_OG_IMAGE_PATH).toBe('/og/default.jpg');
  });

  it('does not reference the removed locale-specific EN asset', () => {
    expect(DEFAULT_OG_IMAGE_PATH).not.toContain('default_en');
    expect(buildDefaultOgImageUrl()).not.toContain('/og/default_en.jpg');
  });

  it('builds an absolute URL from the default OG path', () => {
    expect(buildDefaultOgImageUrl()).toBe('https://example.com/og/default.jpg');
  });
});
