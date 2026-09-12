import { query } from './db';
import { PublicArtistResolverError } from './public-artist-resolver';
import {
  buildPublicationSignalsFromRow,
  isArtistPublishedFromSignals,
  type ArtistPublicationSignals,
} from './artist-publication-signals';

export type { ArtistPublicationSignals };
export { isArtistPublishedFromSignals } from './artist-publication-signals';

type PublicationRow = {
  has_published_tracks: boolean;
};

type ProfileContentRow = {
  has_profile_content: boolean;
};

type PublicArticlesRow = {
  has_public_articles: boolean;
};

/** Profile JSONB fields used for visitor-facing page visibility (mirrors hasPublicProfileContent SQL). */
export type ArtistProfileContentFields = {
  header_images?: unknown;
  the_band?: unknown;
  social_links?: unknown;
};

const EMPTY_THE_BAND_TEXTS = new Set(['null', '[]', '{}', '{"ru":[],"en":[]}']);

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

/**
 * In-memory equivalent of hasPublicProfileContent(userId) SQL on users.header_images / the_band / social_links.
 */
export function hasPublicProfileContentFromFields(fields: ArtistProfileContentFields): boolean {
  const headerImages = fields.header_images;
  if (Array.isArray(headerImages)) {
    const hasHeaderImage = headerImages.some((img) => {
      if (typeof img === 'string') {
        return img.trim() !== '';
      }
      if (img == null) {
        return false;
      }
      const asText = trimText(typeof img === 'object' ? JSON.stringify(img) : img);
      const unquoted = asText.replace(/^"(.*)"$/, '$1').trim();
      return unquoted !== '';
    });
    if (hasHeaderImage) {
      return true;
    }
  }

  const theBand = fields.the_band;
  if (theBand != null) {
    const bandText = trimText(typeof theBand === 'string' ? theBand : JSON.stringify(theBand));
    if (bandText !== '' && !EMPTY_THE_BAND_TEXTS.has(bandText)) {
      return true;
    }
  }

  const socialLinks = fields.social_links;
  if (socialLinks && typeof socialLinks === 'object' && !Array.isArray(socialLinks)) {
    return Object.values(socialLinks as Record<string, unknown>).some(
      (value) => typeof value === 'string' && value.trim() !== ''
    );
  }

  return false;
}

/**
 * Catalog/search visibility: at least one public non-hidden track on a published public release.
 */
export async function getArtistPublicationSignals(
  userId: string
): Promise<ArtistPublicationSignals> {
  const userResult = await query<PublicationRow>(
    `SELECT EXISTS (
       SELECT 1
       FROM tracks t
       INNER JOIN albums a ON t.album_id = a.id
       WHERE a.user_id = u.id
         AND a.is_published = true
         AND a.is_public = true
         AND btrim(COALESCE(a.album, '')) <> ''
         AND COALESCE(t.visibility, 'public') <> 'hidden'
     ) AS has_published_tracks
     FROM users u
     WHERE u.id = $1 AND u.is_active = true
     LIMIT 1`,
    [userId],
    0
  );

  if (userResult.rows.length === 0) {
    return { hasPublishedTracks: false };
  }

  return buildPublicationSignalsFromRow(userResult.rows[0]);
}

async function hasPublishedTracks(userId: string): Promise<boolean> {
  const signals = await getArtistPublicationSignals(userId);
  return isArtistPublishedFromSignals(signals);
}

async function hasPublicArticles(userId: string): Promise<boolean> {
  const result = await query<PublicArticlesRow>(
    `SELECT EXISTS (
       SELECT 1
       FROM articles ar
       WHERE ar.user_id = $1
         AND (ar.is_draft = false OR ar.is_draft IS NULL)
         AND COALESCE(ar.visibility, 'public') <> 'hidden'
     ) AS has_public_articles`,
    [userId],
    0
  );
  return Boolean(result.rows[0]?.has_public_articles);
}

async function hasPublicProfileContent(userId: string): Promise<boolean> {
  const result = await query<ProfileContentRow>(
    `SELECT (
       EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(u.header_images, '[]'::jsonb)) AS img
         WHERE btrim(img #>> '{}') <> '' OR btrim(img::text, '"') <> ''
       )
       OR (
         u.the_band IS NOT NULL
         AND btrim(u.the_band::text) NOT IN ('null', '[]', '{}', '{"ru":[],"en":[]}')
       )
       OR EXISTS (
         SELECT 1
         FROM jsonb_each_text(COALESCE(u.social_links, '{}'::jsonb)) AS sl
         WHERE btrim(sl.value) <> ''
       )
     ) AS has_profile_content
     FROM users u
     WHERE u.id = $1 AND u.is_active = true
     LIMIT 1`,
    [userId],
    0
  );
  return Boolean(result.rows[0]?.has_profile_content);
}

export type AssertArtistVisibleOptions = {
  /** When provided, profile content visibility is evaluated in-memory (no extra users read). */
  profileContentFields?: ArtistProfileContentFields;
};

/** Visitor-facing page content beyond catalog eligibility. */
export async function artistHasPublicPageContent(
  userId: string,
  options?: AssertArtistVisibleOptions
): Promise<boolean> {
  if (options?.profileContentFields) {
    if (hasPublicProfileContentFromFields(options.profileContentFields)) {
      return true;
    }

    const [tracks, articles] = await Promise.all([
      hasPublishedTracks(userId),
      hasPublicArticles(userId),
    ]);
    return tracks || articles;
  }

  // Published tracks alone decide this gate for every visible artist in production, so probing
  // them first turns the passing case into a single round-trip: three concurrent queries against
  // the default pool max of 2 otherwise cost two DB waves.
  //
  // Articles and profile stay a Promise.all pair, which keeps the previous all-or-nothing error
  // behaviour for them — a rejection on either still fails the whole gate rather than being
  // masked by the other returning true.
  if (await hasPublishedTracks(userId)) {
    return true;
  }

  const [articles, profile] = await Promise.all([
    hasPublicArticles(userId),
    hasPublicProfileContent(userId),
  ]);
  return articles || profile;
}

export async function assertArtistVisibleToViewer(
  targetUserId: string,
  viewerUserId: string | null | undefined,
  options?: AssertArtistVisibleOptions
): Promise<void> {
  if (viewerUserId && viewerUserId === targetUserId) return;

  const visible = await artistHasPublicPageContent(targetUserId, options);
  if (!visible) {
    throw new PublicArtistResolverError(404, 'Artist not found', 'ARTIST_NOT_PUBLISHED');
  }
}

/** Catalog / universe / search: published tracks only. */
export async function isArtistProfilePublished(userId: string): Promise<boolean> {
  return hasPublishedTracks(userId);
}
