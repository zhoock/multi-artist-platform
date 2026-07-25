import { normalizeOrigin } from '../publicSiteOrigin';

export interface SitemapEntry {
  path: string;
  priority: string;
}

/** Public SPA routes included in sitemap (no artist-specific or auth URLs). */
export const SITEMAP_PUBLIC_ENTRIES: readonly SitemapEntry[] = [
  { path: '/', priority: '1.0' },
  { path: '/albums', priority: '0.8' },
  { path: '/articles', priority: '0.8' },
  { path: '/stems', priority: '0.7' },
  { path: '/offer', priority: '0.5' },
  { path: '/privacy', priority: '0.5' },
] as const;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildAbsoluteSitemapUrl(origin: string, path: string): string {
  const base = normalizeOrigin(origin);
  if (path === '/') {
    return `${base}/`;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function generateSitemapXml(
  origin: string,
  entries: readonly SitemapEntry[] = SITEMAP_PUBLIC_ENTRIES
): string {
  const urls = entries
    .map(
      (entry) =>
        `  <url><loc>${escapeXml(buildAbsoluteSitemapUrl(origin, entry.path))}</loc><priority>${entry.priority}</priority></url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function generateRobotsTxt(origin: string): string {
  const sitemapUrl = buildAbsoluteSitemapUrl(origin, '/sitemap.xml');
  return `User-agent: *\nDisallow:\n\nSitemap: ${sitemapUrl}\n`;
}
