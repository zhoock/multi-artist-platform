/**
 * Aggregates public URLs for sitemap.xml from PostgreSQL in a few batched queries.
 * Mirrors artist-publication, catalog, and article visibility rules used by public APIs.
 */

import { query } from './db';
import {
  buildDynamicSitemapEntries,
  type SitemapAlbumRow,
  type SitemapArticleRow,
  type SitemapArtistRow,
} from '../../../src/shared/lib/seo/buildDynamicSitemapEntries';
import type { SitemapEntry } from '../../../src/shared/lib/seo/generateSitemap';
import { fetchHelpSitemapEntries } from './help-sitemap-data';

function dedupeSitemapEntries(entries: SitemapEntry[]): SitemapEntry[] {
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

async function fetchVisibleArtists(): Promise<SitemapArtistRow[]> {
  const result = await query<SitemapArtistRow>(
    `WITH active_artists AS (
       SELECT id, public_slug, updated_at, header_images, the_band, social_links
       FROM users
       WHERE is_active = true
         AND public_slug IS NOT NULL
         AND btrim(public_slug) <> ''
     )
     SELECT
       aa.public_slug,
       aa.updated_at,
       EXISTS (
         SELECT 1
         FROM albums a
         INNER JOIN tracks t ON t.album_id = a.id
         WHERE a.user_id = aa.id
           AND a.is_published = true
           AND COALESCE(a.is_public, true) = true
           AND btrim(COALESCE(a.album, '')) <> ''
           AND (
             COALESCE(t.visibility, 'public') <> 'hidden'
             OR COALESCE(t.stems_visibility, 'hidden') <> 'hidden'
           )
       ) AS has_public_albums,
       EXISTS (
         SELECT 1
         FROM articles ar
         WHERE ar.user_id = aa.id
           AND (ar.is_draft = false OR ar.is_draft IS NULL)
           AND COALESCE(ar.visibility, 'public') <> 'hidden'
       ) AS has_public_articles
     FROM active_artists aa
     WHERE
       EXISTS (
         SELECT 1
         FROM albums a
         INNER JOIN tracks t ON t.album_id = a.id
         WHERE a.user_id = aa.id
           AND a.is_published = true
           AND a.is_public = true
           AND btrim(COALESCE(a.album, '')) <> ''
           AND COALESCE(t.visibility, 'public') <> 'hidden'
       )
       OR EXISTS (
         SELECT 1
         FROM articles ar
         WHERE ar.user_id = aa.id
           AND (ar.is_draft = false OR ar.is_draft IS NULL)
           AND COALESCE(ar.visibility, 'public') <> 'hidden'
       )
       OR (
         EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(aa.header_images, '[]'::jsonb)) AS img
           WHERE btrim(img #>> '{}') <> '' OR btrim(img::text, '"') <> ''
         )
         OR (
           aa.the_band IS NOT NULL
           AND btrim(aa.the_band::text) NOT IN ('null', '[]', '{}', '{"ru":[],"en":[]}')
         )
         OR EXISTS (
           SELECT 1
           FROM jsonb_each_text(COALESCE(aa.social_links, '{}'::jsonb)) AS sl
           WHERE btrim(sl.value) <> ''
         )
       )
     ORDER BY aa.public_slug ASC`,
    [],
    0
  );

  return result.rows;
}

async function fetchPublicAlbums(): Promise<SitemapAlbumRow[]> {
  const result = await query<SitemapAlbumRow>(
    `SELECT
       u.public_slug,
       a.album_id,
       MAX(a.updated_at) AS updated_at
     FROM users u
     INNER JOIN albums a ON a.user_id = u.id
     WHERE u.is_active = true
       AND u.public_slug IS NOT NULL
       AND btrim(u.public_slug) <> ''
       AND a.is_published = true
       AND COALESCE(a.is_public, true) = true
       AND btrim(COALESCE(a.album, '')) <> ''
     GROUP BY u.id, u.public_slug, a.album_id
     HAVING EXISTS (
       SELECT 1
       FROM albums a2
       INNER JOIN tracks t ON t.album_id = a2.id
       WHERE a2.user_id = u.id
         AND a2.album_id = a.album_id
         AND (
           COALESCE(t.visibility, 'public') <> 'hidden'
           OR COALESCE(t.stems_visibility, 'hidden') <> 'hidden'
         )
     )
     ORDER BY u.public_slug ASC, a.album_id ASC`,
    [],
    0
  );

  return result.rows;
}

async function fetchPublicArticles(): Promise<SitemapArticleRow[]> {
  const result = await query<SitemapArticleRow>(
    `SELECT
       u.public_slug,
       ar.article_id,
       MAX(ar.updated_at) AS updated_at
     FROM users u
     INNER JOIN articles ar ON ar.user_id = u.id
     WHERE u.is_active = true
       AND u.public_slug IS NOT NULL
       AND btrim(u.public_slug) <> ''
       AND (ar.is_draft = false OR ar.is_draft IS NULL)
       AND COALESCE(ar.visibility, 'public') <> 'hidden'
     GROUP BY u.id, u.public_slug, ar.article_id
     ORDER BY u.public_slug ASC, ar.article_id ASC`,
    [],
    0
  );

  return result.rows;
}

export async function fetchDynamicSitemapEntries(): Promise<SitemapEntry[]> {
  const [artists, albums, articles, helpEntries] = await Promise.all([
    fetchVisibleArtists(),
    fetchPublicAlbums(),
    fetchPublicArticles(),
    Promise.resolve(fetchHelpSitemapEntries()),
  ]);

  return dedupeSitemapEntries([
    ...buildDynamicSitemapEntries({ artists, albums, articles }),
    ...helpEntries,
  ]);
}

export { buildDynamicSitemapEntries };
