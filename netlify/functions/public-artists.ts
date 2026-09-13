import type { Handler, HandlerEvent } from '@netlify/functions';
import { query } from './lib/db';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
} from './lib/api-helpers';

interface PublicArtistRow {
  id: string;
  name: string | null;
  site_name: string | null;
  public_slug: string | null;
  genre_code: string | null;
  label_en: string | null;
  label_ru: string | null;
  header_images: unknown;
  monetization_shop_id: string | null;
}

interface PublicArtistDto {
  userId: string;
  name: string;
  publicSlug: string;
  genreCode: string;
  genreLabel: { en: string; ru: string };
  headerImages: string[];
  /** Active payment acceptance — gates collection / exclusive content on the public page. */
  monetizationEnabled: boolean;
}

function toHeaderImageUrl(userId: string, image: string): string {
  const value = image.trim();
  if (!value) return '';

  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/api/proxy-image') ||
    value.startsWith('/.netlify/functions/proxy-image')
  ) {
    return value;
  }

  const hasExt = /\.(jpg|jpeg|png|webp|gif)$/i.test(value);
  const path = value.startsWith('users/')
    ? value
    : `users/${userId}/hero/${hasExt ? value : `${value}.jpg`}`;

  return `/api/proxy-image?path=${encodeURIComponent(path)}`;
}

export const handler: Handler = async (
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed. Use GET.');
  }

  try {
    // The publication gate is a correlated EXISTS rather than a join: an artist has one row per
    // release per locale in `albums`, so joining would emit the same artist once per matching
    // track. Nothing downstream dedupes.
    const rows = await query<PublicArtistRow>(
      `SELECT
         u.id,
         u.name,
         u.site_name,
         u.public_slug,
         u.genre_code,
         g.label_en,
         g.label_ru,
         u.header_images,
         ups.shop_id AS monetization_shop_id
       FROM users u
       JOIN genres g ON g.code = u.genre_code
       LEFT JOIN user_payment_settings ups
         ON ups.user_id = u.id::text
        AND ups.provider = 'yookassa'
        AND ups.is_active = true
       WHERE u.is_active = true
         AND u.public_slug IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM tracks t
           INNER JOIN albums a ON t.album_id = a.id
           WHERE a.user_id = u.id
             AND a.is_published = true
             AND a.is_public = true
             AND btrim(COALESCE(a.album, '')) <> ''
             AND COALESCE(t.visibility, 'public') <> 'hidden'
         )
       ORDER BY u.id ASC`
    );

    const artists: PublicArtistDto[] = rows.rows.map((row) => {
      const genreCode = row.genre_code || 'other';
      const genreLabel = {
        en: row.label_en || 'Other',
        ru: row.label_ru || 'Другое',
      };
      const displayName = row.site_name || row.name || row.public_slug || 'Unknown artist';

      const headerImagesRaw = Array.isArray(row.header_images) ? row.header_images : [];
      const headerImageUrls = headerImagesRaw
        .map((image) => String(image))
        .map((image) => toHeaderImageUrl(row.id, image))
        .filter(Boolean);

      return {
        userId: row.id,
        name: displayName,
        publicSlug: row.public_slug || '',
        genreCode,
        genreLabel,
        headerImages: headerImageUrls,
        monetizationEnabled: Boolean(row.monetization_shop_id?.trim()),
      };
    });

    return createSuccessResponse(artists);
  } catch (error) {
    console.error('❌ [public-artists] failed:', error);
    return createErrorResponse(500, 'Failed to load public artists');
  }
};
