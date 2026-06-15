import {
  SITEMAP_PUBLIC_ENTRIES,
  buildAbsoluteSitemapUrl,
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

    for (const entry of SITEMAP_PUBLIC_ENTRIES) {
      expect(xml).toContain(buildAbsoluteSitemapUrl(origin, entry.path));
    }
  });
});
