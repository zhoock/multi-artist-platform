import { query } from './db';

interface UserIdRow {
  id: string;
}

/** Profile row loaded in one query by public_slug (GET /api/user-profile?artist=). */
export interface PublicArtistProfileRow {
  id: string;
  name?: string | null;
  public_slug?: string | null;
  the_band: unknown;
  header_images?: unknown;
  social_links?: unknown;
  site_name?: string | null;
  genre_code?: string | null;
}

export class PublicArtistResolverError extends Error {
  statusCode: number;
  code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'PublicArtistResolverError';
  }
}

function normalizeArtistSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/**
 * Resolves public artist owner user_id.
 * - If artist slug is provided, finds user by users.public_slug
 * - If absent, uses users.is_default_public_site = true
 * - Throws PublicArtistResolverError(404) when slug not found
 * - Throws PublicArtistResolverError(500) for configuration errors
 */
export async function resolvePublicArtistUserId(artistSlug?: string | null): Promise<string> {
  const normalizedSlug = artistSlug ? normalizeArtistSlug(artistSlug) : '';

  if (normalizedSlug) {
    const bySlug = await query<UserIdRow>(
      `SELECT id
       FROM users
       WHERE public_slug = $1 AND is_active = true
       LIMIT 1`,
      [normalizedSlug],
      0
    );

    if (bySlug.rows.length === 0) {
      throw new PublicArtistResolverError(404, 'Artist not found', 'ARTIST_NOT_FOUND');
    }

    return bySlug.rows[0].id;
  }

  return resolveDefaultPublicArtistUserId();
}

async function resolveDefaultPublicArtistUserId(): Promise<string> {
  const defaultUser = await query<UserIdRow>(
    `SELECT id
     FROM users
     WHERE is_default_public_site = true AND is_active = true
     LIMIT 2`,
    [],
    0
  );

  if (defaultUser.rows.length !== 1) {
    throw new PublicArtistResolverError(
      500,
      'Configuration error: exactly one default public user must exist'
    );
  }

  return defaultUser.rows[0].id;
}

/**
 * Loads an active artist profile row by public slug in a single query.
 * Used by GET /api/user-profile?artist= to avoid a separate id lookup + profile fetch.
 */
export async function fetchPublicArtistProfileBySlug(
  artistSlug: string
): Promise<PublicArtistProfileRow> {
  const normalizedSlug = normalizeArtistSlug(artistSlug);
  if (!normalizedSlug) {
    throw new PublicArtistResolverError(404, 'Artist not found', 'ARTIST_NOT_FOUND');
  }

  const result = await query<PublicArtistProfileRow>(
    `SELECT id, name, public_slug, the_band, header_images, social_links, site_name, genre_code
     FROM users
     WHERE public_slug = $1 AND is_active = true
     LIMIT 1`,
    [normalizedSlug],
    0
  );

  if (result.rows.length === 0) {
    throw new PublicArtistResolverError(404, 'Artist not found', 'ARTIST_NOT_FOUND');
  }

  return result.rows[0];
}
