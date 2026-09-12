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
import { mergeCatalogTrackLocales } from './lib/mergeCatalogTrackLocales';

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
  /**
   * Album has ≥1 non-hidden track with stems in Storage (`tracks.has_stems`).
   * Used by public Mixer to list only albums with stems (not fat /api/albums).
   */
  hasStems: boolean;
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
  has_stems: boolean | null;
}

/**
 * One row of the albums ⟕ tracks catalog query: every album locale row repeats once per track,
 * and a locale row with no tracks still arrives once with all track columns NULL.
 */
interface CatalogJoinRow extends AlbumLocaleRow {
  track_id: string | null;
  duration: number | null;
  visibility: string | null;
  stems_visibility: string | null;
  has_stems: boolean | null;
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

    // Monetization and the catalog both key off targetUserId only and neither reads the other's
    // result, so they share one round-trip wave. Two concurrent queries is the pool ceiling
    // (PG_POOL_MAX defaults to 2), which is why the premium check below stays sequential.
    //
    // Tracks join in the same query instead of a follow-up round-trip: tracks.album_id is a FK on
    // the album *locale* row, so the join fans out per track without ever multiplying locales.
    // LEFT is required — a locale row with zero tracks still supplies title / cover / release /
    // publication flags (production has one: album `23-remastered`, lang `en`).
    const [monetizationEnabled, catalogResult] = await Promise.all([
      artistHasMonetizationEnabled(targetUserId),
      query<CatalogJoinRow>(
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
           a.updated_at,
           t.track_id,
           t.duration,
           t.visibility,
           t.stems_visibility,
           t.has_stems
         FROM albums a
         LEFT JOIN tracks t ON t.album_id = a.id
         WHERE a.user_id = $1
         ORDER BY a.album_id,
           CASE a.lang WHEN 'ru' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,
           a.updated_at DESC NULLS LAST,
           a.created_at DESC`,
        [targetUserId]
      ),
    ]);

    const hasPremiumAccess = await viewerHasPremiumAccessToArtist(authUserId, targetUserId);

    // Flat join rows → the locale-row / track-row shape the rest of the handler consumes.
    // Locale rows dedupe on the album primary key, so first occurrence carries the SQL ORDER BY.
    const byAlbumId = new Map<string, AlbumLocaleRow[]>();
    const albumIdsOrdered: string[] = [];
    const seenAlbumPks = new Set<string>();
    const trackByPk = new Map<string, TrackAggRow[]>();

    for (const row of catalogResult.rows) {
      if (!seenAlbumPks.has(row.id)) {
        seenAlbumPks.add(row.id);
        if (!byAlbumId.has(row.album_id)) {
          albumIdsOrdered.push(row.album_id);
          byAlbumId.set(row.album_id, []);
        }
        byAlbumId.get(row.album_id)!.push({
          id: row.id,
          user_id: row.user_id,
          album_id: row.album_id,
          album: row.album,
          cover: row.cover,
          release: row.release,
          is_public: row.is_public,
          is_published: row.is_published,
          lang: row.lang,
          updated_at: row.updated_at,
        });
      }

      // NULL track_id marks a locale row that has no tracks — not a track. Counting it would
      // inflate trackCount and push a trackless album past the publication gate below.
      if (row.track_id === null || row.track_id === undefined) continue;

      const list = trackByPk.get(row.id) ?? [];
      list.push({
        album_pk: row.id,
        track_id: row.track_id,
        duration: row.duration,
        visibility: row.visibility,
        stems_visibility: row.stems_visibility,
        has_stems: row.has_stems,
      });
      trackByPk.set(row.id, list);
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

      // Unique track_ids across locales:
      // - presentation base: first locale (langRank: ru → en)
      // - technical: has_stems = OR; visibility / stems_visibility = most open; duration = max
      //   (stems_visibility is track-level access, not a translation — see mergeCatalogTrackLocales)
      const trackRowsById = new Map<string, TrackAggRow[]>();
      const sortedLocales = [...group].sort((a, b) => langRank(a.lang) - langRank(b.lang));
      for (const locale of sortedLocales) {
        for (const track of trackByPk.get(locale.id) ?? []) {
          const list = trackRowsById.get(track.track_id) ?? [];
          list.push(track);
          trackRowsById.set(track.track_id, list);
        }
      }
      const trackMap = new Map<string, TrackAggRow>();
      for (const [trackId, rows] of trackRowsById) {
        trackMap.set(trackId, mergeCatalogTrackLocales(rows));
      }

      let trackCount = 0;
      let duration = 0;
      let hasLockedTracks = false;
      let hasStems = false;

      for (const track of trackMap.values()) {
        const stemsVis = normalizeStemsVisibility(track.stems_visibility);
        if (track.has_stems === true && stemsVis !== 'hidden') {
          hasStems = true;
        }

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
        hasStems,
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
