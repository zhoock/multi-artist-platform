import { normalizeOrigin } from '../publicSiteOrigin';
import { buildLocalizedPublicPath, SUPPORTED_LANGS, type RouteLang } from '../i18n/routeLang';

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

/** Platform-wide SPA routes (no auth, payment, or dashboard URLs) — unlocalized templates. */
export const SITEMAP_PLATFORM_PATH_TEMPLATES: readonly SitemapEntry[] = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/stems', priority: '0.7', changefreq: 'weekly' },
  { path: '/offer', priority: '0.5', changefreq: 'monthly' },
  { path: '/privacy', priority: '0.5', changefreq: 'monthly' },
  { path: '/help', priority: '0.6', changefreq: 'weekly' },
] as const;

/** Expands unlocalized sitemap paths into `ru` + `en` entries. */
export function localizeSitemapEntriesForAllLangs(
  entries: readonly SitemapEntry[]
): SitemapEntry[] {
  return SUPPORTED_LANGS.flatMap((lang) =>
    entries.map((entry) => ({
      ...entry,
      path: buildLocalizedPublicPath(lang, entry.path),
    }))
  );
}

/** Localized platform routes included in sitemap.xml (`/ru/*`, `/en/*`). */
export const SITEMAP_PLATFORM_ENTRIES: readonly SitemapEntry[] = localizeSitemapEntriesForAllLangs(
  SITEMAP_PLATFORM_PATH_TEMPLATES
);

/** Appends one sitemap row per supported locale using a semantic path builder. */
export function appendLocalizedSitemapEntries(
  target: SitemapEntry[],
  buildLocalizedPath: (lang: RouteLang) => string,
  meta: Omit<SitemapEntry, 'path'>
): void {
  for (const lang of SUPPORTED_LANGS) {
    target.push({
      path: buildLocalizedPath(lang),
      ...meta,
    });
  }
}

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
