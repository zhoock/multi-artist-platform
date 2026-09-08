import {
  SITEMAP_PLATFORM_ENTRIES,
  SITEMAP_PLATFORM_PATH_TEMPLATES,
  buildAbsoluteSitemapUrl,
  formatSitemapLastmod,
  generateRobotsTxt,
  generateSitemapXml,
  localizeSitemapEntriesForAllLangs,
} from '../seo/generateSitemap';
import { FORBIDDEN_PUBLIC_DOMAIN } from '../publicSiteOrigin';

describe('generateSitemap', () => {
  const origin = 'https://multi-artist-platform.netlify.app';

  it('generates sitemap XML with localized platform URLs', () => {
    const xml = generateSitemapXml(origin);

    expect(xml).toContain('<loc>https://multi-artist-platform.netlify.app/ru</loc>');
    expect(xml).toContain('<loc>https://multi-artist-platform.netlify.app/en</loc>');
    expect(xml).not.toContain('<loc>https://multi-artist-platform.netlify.app/ru/albums</loc>');
    expect(xml).not.toContain('<loc>https://multi-artist-platform.netlify.app/en/albums</loc>');
    expect(xml).not.toContain('<loc>https://multi-artist-platform.netlify.app/ru/articles</loc>');
    expect(xml).not.toContain('<loc>https://multi-artist-platform.netlify.app/en/articles</loc>');
    expect(xml).not.toContain('<loc>https://multi-artist-platform.netlify.app/albums</loc>');
    expect(xml).not.toContain(FORBIDDEN_PUBLIC_DOMAIN);
  });

  it('generates robots.txt pointing at the same origin sitemap', () => {
    const robots = generateRobotsTxt(origin);

    expect(robots).toContain('Sitemap: https://multi-artist-platform.netlify.app/sitemap.xml');
    expect(robots).not.toContain(FORBIDDEN_PUBLIC_DOMAIN);
  });

  it('buildAbsoluteSitemapUrl keeps trailing slash only for home', () => {
    expect(buildAbsoluteSitemapUrl(origin, '/')).toBe('https://multi-artist-platform.netlify.app/');
    expect(buildAbsoluteSitemapUrl(origin, '/ru/albums')).toBe(
      'https://multi-artist-platform.netlify.app/ru/albums'
    );
  });

  it('includes all configured localized public routes', () => {
    const xml = generateSitemapXml(origin);

    for (const entry of SITEMAP_PLATFORM_ENTRIES) {
      expect(xml).toContain(buildAbsoluteSitemapUrl(origin, entry.path));
    }
  });

  it('localizes platform templates for ru and en', () => {
    const localized = localizeSitemapEntriesForAllLangs(SITEMAP_PLATFORM_PATH_TEMPLATES);
    const paths = localized.map((entry) => entry.path);

    expect(paths).toContain('/ru');
    expect(paths).toContain('/en');
    expect(paths).toContain('/ru/stems');
    expect(paths).toContain('/en/stems');
    expect(paths).not.toContain('/ru/albums');
    expect(paths).not.toContain('/en/albums');
    expect(paths).not.toContain('/ru/articles');
    expect(paths).not.toContain('/en/articles');
    expect(paths).not.toContain('/');
    expect(paths).not.toContain('/albums');
  });

  it('omits lastmod and changefreq tags when not provided', () => {
    const xml = generateSitemapXml(origin, [{ path: '/ru/offer', priority: '0.5' }]);

    expect(xml).toContain('<loc>https://multi-artist-platform.netlify.app/ru/offer</loc>');
    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('<changefreq>');
  });

  it('includes optional lastmod and changefreq when provided', () => {
    const xml = generateSitemapXml(origin, [
      {
        path: '/ru?artist=band',
        priority: '0.9',
        changefreq: 'weekly',
        lastmod: '2026-07-31',
      },
    ]);

    expect(xml).toContain('<lastmod>2026-07-31</lastmod>');
    expect(xml).toContain('<changefreq>weekly</changefreq>');
  });
});

describe('formatSitemapLastmod', () => {
  it('returns undefined for invalid values', () => {
    expect(formatSitemapLastmod(null)).toBeUndefined();
    expect(formatSitemapLastmod('not-a-date')).toBeUndefined();
  });

  it('formats valid dates as YYYY-MM-DD', () => {
    expect(formatSitemapLastmod('2026-07-31T12:00:00.000Z')).toBe('2026-07-31');
  });
});
