import {
  SITEMAP_PLATFORM_ENTRIES,
  buildAbsoluteSitemapUrl,
  formatSitemapLastmod,
  generateRobotsTxt,
  generateSitemapXml,
} from '../seo/generateSitemap';
import { LEGACY_BAND_PUBLIC_DOMAIN } from '../publicSiteOrigin';

describe('generateSitemap', () => {
  const origin = 'https://multi-artist-platform.netlify.app';

  it('generates sitemap XML with platform origin only', () => {
    const xml = generateSitemapXml(origin);

    expect(xml).toContain('<loc>https://multi-artist-platform.netlify.app/</loc>');
    expect(xml).toContain('<loc>https://multi-artist-platform.netlify.app/albums</loc>');
    expect(xml).not.toContain(LEGACY_BAND_PUBLIC_DOMAIN);
  });

  it('generates robots.txt pointing at the same origin sitemap', () => {
    const robots = generateRobotsTxt(origin);

    expect(robots).toContain('Sitemap: https://multi-artist-platform.netlify.app/sitemap.xml');
    expect(robots).not.toContain(LEGACY_BAND_PUBLIC_DOMAIN);
  });

  it('buildAbsoluteSitemapUrl keeps trailing slash only for home', () => {
    expect(buildAbsoluteSitemapUrl(origin, '/')).toBe('https://multi-artist-platform.netlify.app/');
    expect(buildAbsoluteSitemapUrl(origin, '/albums')).toBe(
      'https://multi-artist-platform.netlify.app/albums'
    );
  });

  it('includes all configured public routes', () => {
    const xml = generateSitemapXml(origin);

    for (const entry of SITEMAP_PLATFORM_ENTRIES) {
      expect(xml).toContain(buildAbsoluteSitemapUrl(origin, entry.path));
    }
  });

  it('omits lastmod and changefreq tags when not provided', () => {
    const xml = generateSitemapXml(origin, [{ path: '/offer', priority: '0.5' }]);

    expect(xml).toContain('<loc>https://multi-artist-platform.netlify.app/offer</loc>');
    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('<changefreq>');
  });

  it('includes optional lastmod and changefreq when provided', () => {
    const xml = generateSitemapXml(origin, [
      {
        path: '/?artist=band',
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
