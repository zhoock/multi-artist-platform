import { normalizeOrigin } from '../publicSiteOrigin';

export type SitemapChangeFreq =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

export interface SitemapEntry {
  path: string;
  priority?: string;
  changefreq?: SitemapChangeFreq;
  /** ISO date (YYYY-MM-DD) or full ISO datetime — emitted as W3C lastmod when set. */
  lastmod?: string;
}

/** Platform-wide SPA routes (no auth, payment, or dashboard URLs). */
export const SITEMAP_PLATFORM_ENTRIES: readonly SitemapEntry[] = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/albums', priority: '0.8', changefreq: 'daily' },
  { path: '/articles', priority: '0.8', changefreq: 'daily' },
  { path: '/stems', priority: '0.7', changefreq: 'weekly' },
  { path: '/offer', priority: '0.5', changefreq: 'monthly' },
  { path: '/privacy', priority: '0.5', changefreq: 'monthly' },
] as const;

/** @deprecated Use SITEMAP_PLATFORM_ENTRIES */
export const SITEMAP_PUBLIC_ENTRIES = SITEMAP_PLATFORM_ENTRIES;

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

/** Normalize DB / API timestamps to sitemap lastmod (date portion only). */
export function formatSitemapLastmod(value: Date | string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function renderSitemapUrl(origin: string, entry: SitemapEntry): string {
  const parts = [`<loc>${escapeXml(buildAbsoluteSitemapUrl(origin, entry.path))}</loc>`];
  if (entry.lastmod) {
    parts.push(`<lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
  }
  if (entry.changefreq) {
    parts.push(`<changefreq>${entry.changefreq}</changefreq>`);
  }
  if (entry.priority) {
    parts.push(`<priority>${entry.priority}</priority>`);
  }
  return `  <url>${parts.join('')}</url>`;
}

export function generateSitemapXml(
  origin: string,
  entries: readonly SitemapEntry[] = SITEMAP_PLATFORM_ENTRIES
): string {
  const urls = entries.map((entry) => renderSitemapUrl(origin, entry)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function generateRobotsTxt(origin: string): string {
  const sitemapUrl = buildAbsoluteSitemapUrl(origin, '/sitemap.xml');
  return `User-agent: *\nDisallow:\n\nSitemap: ${sitemapUrl}\n`;
}
