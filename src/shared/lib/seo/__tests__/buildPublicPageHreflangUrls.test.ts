import { buildPublicPageHreflangUrls } from '../buildPublicPageHreflangUrls';
import { buildLocalizedPublicPath } from '../../i18n/routeLang';

jest.mock('../../publicSiteOrigin', () => ({
  buildPublicSiteUrl: (path: string) => `https://example.com${path}`,
}));

describe('buildPublicPageHreflangUrls', () => {
  it('builds ru, en, and x-default from one path builder', () => {
    const hreflang = buildPublicPageHreflangUrls((lang) =>
      buildLocalizedPublicPath(lang, '/offer')
    );

    expect(hreflang).toEqual({
      ru: 'https://example.com/ru/offer',
      en: 'https://example.com/en/offer',
      xDefault: 'https://example.com/ru/offer',
    });
  });
});
