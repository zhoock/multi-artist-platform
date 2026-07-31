import type { SitemapEntry } from './generateSitemap';
import { formatSitemapLastmod, SITEMAP_PLATFORM_ENTRIES } from './generateSitemap';
import {
  buildArtistAlbumsCatalogPath,
  buildArtistArticlesCatalogPath,
  buildArtistPagePath,
  buildPublicAlbumPagePath,
  buildPublicArticlePagePath,
} from './publicPagePaths';

export type SitemapArtistRow = {
  public_slug: string;
  updated_at: Date | string | null;
  has_public_albums: boolean;
  has_public_articles: boolean;
};

export type SitemapAlbumRow = {
  public_slug: string;
  album_id: string;
  updated_at: Date | string | null;
};

export type SitemapArticleRow = {
  public_slug: string;
  article_id: string;
  updated_at: Date | string | null;
};

function dedupeEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const byPath = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    const existing = byPath.get(entry.path);
    if (!existing) {
      byPath.set(entry.path, entry);
      continue;
    }
    if (entry.lastmod && (!existing.lastmod || entry.lastmod > existing.lastmod)) {
      byPath.set(entry.path, { ...existing, ...entry, lastmod: entry.lastmod });
    }
  }
  return [...byPath.values()];
}

function maxUpdatedAt(rows: Array<{ updated_at: Date | string | null }>): string | undefined {
  const latest = rows.reduce<Date | string | null>((acc, row) => {
    if (!row.updated_at) return acc;
    if (!acc) return row.updated_at;
    return new Date(row.updated_at).getTime() > new Date(acc).getTime() ? row.updated_at : acc;
  }, null);
  return formatSitemapLastmod(latest);
}

export function buildDynamicSitemapEntries(input: {
  artists: SitemapArtistRow[];
  albums: SitemapAlbumRow[];
  articles: SitemapArticleRow[];
}): SitemapEntry[] {
  const entries: SitemapEntry[] = [...SITEMAP_PLATFORM_ENTRIES];

  const albumsByArtist = new Map<string, SitemapAlbumRow[]>();
  for (const album of input.albums) {
    const slug = album.public_slug.trim();
    if (!slug) continue;
    const list = albumsByArtist.get(slug) ?? [];
    list.push(album);
    albumsByArtist.set(slug, list);
  }

  const articlesByArtist = new Map<string, SitemapArticleRow[]>();
  for (const article of input.articles) {
    const slug = article.public_slug.trim();
    if (!slug) continue;
    const list = articlesByArtist.get(slug) ?? [];
    list.push(article);
    articlesByArtist.set(slug, list);
  }

  for (const artist of input.artists) {
    const slug = artist.public_slug.trim();
    if (!slug) continue;

    const artistLastmod = formatSitemapLastmod(artist.updated_at);
    entries.push({
      path: buildArtistPagePath(slug),
      priority: '0.9',
      changefreq: 'weekly',
      ...(artistLastmod ? { lastmod: artistLastmod } : {}),
    });

    const artistAlbums = albumsByArtist.get(slug) ?? [];
    if (artist.has_public_albums && artistAlbums.length > 0) {
      const catalogLastmod = maxUpdatedAt(artistAlbums);
      entries.push({
        path: buildArtistAlbumsCatalogPath(slug),
        priority: '0.7',
        changefreq: 'weekly',
        ...(catalogLastmod ? { lastmod: catalogLastmod } : {}),
      });

      for (const album of artistAlbums) {
        const albumLastmod = formatSitemapLastmod(album.updated_at);
        entries.push({
          path: buildPublicAlbumPagePath(album.album_id, slug),
          priority: '0.6',
          changefreq: 'weekly',
          ...(albumLastmod ? { lastmod: albumLastmod } : {}),
        });
      }
    }

    const artistArticles = articlesByArtist.get(slug) ?? [];
    if (artist.has_public_articles && artistArticles.length > 0) {
      const catalogLastmod = maxUpdatedAt(artistArticles);
      entries.push({
        path: buildArtistArticlesCatalogPath(slug),
        priority: '0.7',
        changefreq: 'weekly',
        ...(catalogLastmod ? { lastmod: catalogLastmod } : {}),
      });

      for (const article of artistArticles) {
        const articleLastmod = formatSitemapLastmod(article.updated_at);
        entries.push({
          path: buildPublicArticlePagePath(article.article_id, slug),
          priority: '0.6',
          changefreq: 'monthly',
          ...(articleLastmod ? { lastmod: articleLastmod } : {}),
        });
      }
    }
  }

  return dedupeEntries(entries);
}
