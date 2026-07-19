/**
 * Thin public artist catalog — GET /api/artists/:slug/albums
 *
 * Returns only fields needed for Artist Page album cards.
 * Full album/track/lyrics payloads remain on GET /api/albums.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { query } from './lib/db';
import {
  CORS_HEADERS,
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getAuthorizationHeaderFromEvent,
} from './lib/api-helpers';
import { classifyAuthorizationHeader } from './lib/jwt';
import { assertArtistVisibleToViewer } from './lib/artist-publication';
import { PublicArtistResolverError, resolvePublicArtistUserId } from './lib/public-artist-resolver';
import { viewerHasPremiumAccessToArtist } from './lib/entitlements';
import { artistHasMonetizationEnabled } from './lib/artist-monetization';
import { resolveEffectiveContentVisibility } from '../../src/shared/lib/payment/artistMonetization';
import { normalizeTrackVisibility } from '../../src/shared/lib/tracks/trackVisibility';
import { normalizeStemsVisibility } from '../../src/shared/lib/stems/stemsVisibility';

export interface CatalogAlbumDto {
  albumId: string;
  slug: string;
  title: string;
  cover: string;
  releaseDate: string;
  trackCount: number;
  duration: number;
  userId: string;
  isPublished: boolean;
  isPublic: boolean;
  /** Viewer would need entitlement for at least one listed track. */
  hasLockedTracks: boolean;
}

interface AlbumLocaleRow {
  id: string;
  user_id: string | null;
  album_id: string;
  album: string;
  cover: string | null;
  release: unknown;
  is_public: boolean;
  is_published: boolean;
  lang: string;
  updated_at: Date | string | null;
}

interface TrackAggRow {
  album_pk: string;
  track_id: string;
  duration: number | null;
  visibility: string | null;
  stems_visibility: string | null;
}

function parseReleaseDate(release: unknown): string {
  if (!release || typeof release !== 'object') return '';
  const date = (release as { date?: unknown }).date;
  return typeof date === 'string' ? date : '';
}

function parseSlugFromEvent(event: HandlerEvent): string {
  const fromQuery = event.queryStringParameters?.slug?.trim() ?? '';
  if (fromQuery) return fromQuery.toLowerCase();

  const path = event.path || '';
  const match = path.match(/\/artists\/([^/]+)\/albums\/?$/i);
  if (match?.[1]) return decodeURIComponent(match[1]).trim().toLowerCase();

  return '';
}

function langRank(lang: string): number {
  if (lang === 'ru') return 0;
  if (lang === 'en') return 1;
  return 2;
}

function isCatalogTrackVisible(
  visibility: string | null | undefined,
  stemsVisibility: string | null | undefined
): boolean {
  const trackVis = normalizeTrackVisibility(visibility);
  if (trackVis !== 'hidden') return true;
  return normalizeStemsVisibility(stemsVisibility) !== 'hidden';
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
    const slug = parseSlugFromEvent(event);
    if (!slug) {
      return createErrorResponse(400, 'Missing artist slug');
    }

    const authVerdict = classifyAuthorizationHeader(getAuthorizationHeaderFromEvent(event));
    const authUserId = authVerdict.kind === 'valid' ? authVerdict.userId : null;

    let targetUserId: string;
    try {
      targetUserId = await resolvePublicArtistUserId(slug);
    } catch (error) {
      if (error instanceof PublicArtistResolverError) {
        return createErrorResponse(error.statusCode, error.message, CORS_HEADERS, {
          code: error.code,
        });
      }
      throw error;
    }

    try {
      await assertArtistVisibleToViewer(targetUserId, authUserId);
    } catch (error) {
      if (error instanceof PublicArtistResolverError) {
        return createErrorResponse(error.statusCode, error.message, CORS_HEADERS, {
          code: error.code,
        });
      }
      throw error;
    }

    const isOwnerViewer = Boolean(authUserId && authUserId === targetUserId);
    const monetizationEnabled = await artistHasMonetizationEnabled(targetUserId);
    const hasPremiumAccess = await viewerHasPremiumAccessToArtist(authUserId, targetUserId);

    const albumsResult = await query<AlbumLocaleRow>(
      `SELECT
         a.id,
         a.user_id,
         a.album_id,
         a.album,
         a.cover,
         a.release,
         a.is_public,
         a.is_published,
         a.lang,
         a.updated_at
       FROM albums a
       WHERE a.user_id = $1
       ORDER BY a.album_id,
         CASE a.lang WHEN 'ru' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,
         a.updated_at DESC NULLS LAST,
         a.created_at DESC`,
      [targetUserId]
    );

    const byAlbumId = new Map<string, AlbumLocaleRow[]>();
    const albumIdsOrdered: string[] = [];
    for (const row of albumsResult.rows) {
      if (!byAlbumId.has(row.album_id)) {
        albumIdsOrdered.push(row.album_id);
        byAlbumId.set(row.album_id, []);
      }
      byAlbumId.get(row.album_id)!.push(row);
    }

    const albumPks = albumsResult.rows.map((r) => r.id);
    const trackByPk = new Map<string, TrackAggRow[]>();

    if (albumPks.length > 0) {
      let tracksResult: { rows: TrackAggRow[] };
      try {
        tracksResult = await query<TrackAggRow>(
          `SELECT
             t.album_id AS album_pk,
             t.track_id,
             t.duration,
             t.visibility,
             t.stems_visibility
           FROM tracks t
           WHERE t.album_id = ANY($1::uuid[])`,
          [albumPks]
        );
      } catch {
        // Pre-migration fallback without visibility columns.
        tracksResult = await query<TrackAggRow>(
          `SELECT
             t.album_id AS album_pk,
             t.track_id,
             t.duration,
             NULL::text AS visibility,
             NULL::text AS stems_visibility
           FROM tracks t
           WHERE t.album_id = ANY($1::uuid[])`,
          [albumPks]
        );
      }
      for (const row of tracksResult.rows) {
        const list = trackByPk.get(row.album_pk) ?? [];
        list.push(row);
        trackByPk.set(row.album_pk, list);
      }
    }

    const catalog: CatalogAlbumDto[] = [];

    for (const albumKey of albumIdsOrdered) {
      const group = byAlbumId.get(albumKey)!;
      const shared = [...group].sort((a, b) => {
        const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return tb - ta;
      })[0];

      const enRow = group.find((r) => r.lang === 'en');
      const ruRow = group.find((r) => r.lang === 'ru');
      const title =
        (enRow?.album && String(enRow.album).trim()) ||
        (ruRow?.album && String(ruRow.album).trim()) ||
        (shared.album && String(shared.album).trim()) ||
        '';

      const isPublished = shared.is_published === true;
      const isPublic = shared.is_public !== false;

      // Unique track_ids across locales (same merge semantics as full albums API).
      const trackMap = new Map<string, TrackAggRow>();
      const sortedLocales = [...group].sort((a, b) => langRank(a.lang) - langRank(b.lang));
      for (const locale of sortedLocales) {
        for (const track of trackByPk.get(locale.id) ?? []) {
          if (!trackMap.has(track.track_id)) {
            trackMap.set(track.track_id, track);
          }
        }
      }

      let trackCount = 0;
      let duration = 0;
      let hasLockedTracks = false;

      for (const track of trackMap.values()) {
        if (!isCatalogTrackVisible(track.visibility, track.stems_visibility)) continue;

        trackCount += 1;
        duration +=
          typeof track.duration === 'number' && !Number.isNaN(track.duration) ? track.duration : 0;

        const visibility = resolveEffectiveContentVisibility(
          normalizeTrackVisibility(track.visibility),
          monetizationEnabled
        );
        if (visibility === 'subscribers_only' && !hasPremiumAccess) {
          hasLockedTracks = true;
        }
      }

      if (!isOwnerViewer && (!isPublished || !isPublic || !title || trackCount === 0)) {
        continue;
      }

      catalog.push({
        albumId: albumKey,
        slug: albumKey,
        title,
        cover: typeof shared.cover === 'string' ? shared.cover : '',
        releaseDate: parseReleaseDate(shared.release),
        trackCount,
        duration,
        userId: shared.user_id ?? targetUserId,
        isPublished,
        isPublic,
        hasLockedTracks,
      });
    }

    return createSuccessResponse(catalog);
  } catch (error) {
    console.error('[artist-albums-catalog]', error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Failed to load artist album catalog'
    );
  }
};
