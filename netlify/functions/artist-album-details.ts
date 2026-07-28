/**
 * Mid-weight album page payload — GET /api/artists/:slug/albums/:albumId
 *
 * Returns AlbumDetails (page fields + playable tracks).
 * Lyrics stay on /api/track-lyrics. Full CRUD/list remains on GET /api/albums.
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
import {
  isAlbumDetailsVisibleToPublicViewer,
  mapLocalesToAlbumDetails,
  type AlbumDetailsLocaleSource,
  type AlbumDetailsTrackSource,
} from './lib/album-details-mapper';
import { fetchTrackAssetsByAlbumPks, resolvePipelineAvailable } from './lib/track-assets-loader';
import { tracksTableHasPipelineColumns } from './lib/track-pipeline-schema';

interface AlbumLocaleRow {
  id: string;
  user_id: string | null;
  album_id: string;
  album: string;
  full_name: string | null;
  description: string | null;
  cover: string | null;
  release: unknown;
  buttons: unknown;
  details: unknown;
  photographer: string | null;
  photographer_url: string | null;
  designer: string | null;
  designer_url: string | null;
  is_public: boolean;
  is_published: boolean;
  lang: string;
  updated_at: Date | string | null;
}

interface TrackRow {
  album_pk: string;
  track_id: string;
  title: string;
  duration: number | null;
  src: string | null;
  order_index: number | null;
  visibility: string | null;
  stems_visibility: string | null;
  audio_container: string | null;
  audio_codec: string | null;
  audio_bitrate: number | null;
  audio_sample_rate: number | null;
  audio_bit_depth: number | null;
  audio_channels: number | null;
  audio_duration: number | null;
  audio_file_size: number | null;
  processing_status: string | null;
  master_path: string | null;
}

function parseSlugAndAlbumId(event: HandlerEvent): { slug: string; albumId: string } {
  const q = event.queryStringParameters ?? {};
  let slug = (q.slug ?? '').trim().toLowerCase();
  let albumId = (q.albumId ?? '').trim();

  const path = event.path || '';
  const match = path.match(/\/artists\/([^/]+)\/albums\/([^/]+)\/?$/i);
  if (match) {
    if (!slug) slug = decodeURIComponent(match[1]).trim().toLowerCase();
    if (!albumId) albumId = decodeURIComponent(match[2]).trim();
  }

  return { slug, albumId };
}

async function fetchTracksForAlbumPks(albumPks: string[]): Promise<Map<string, TrackRow[]>> {
  const byPk = new Map<string, TrackRow[]>();
  if (albumPks.length === 0) return byPk;

  const hasPipeline = await tracksTableHasPipelineColumns();
  const pipelineCols = hasPipeline
    ? `,\n         t.processing_status,\n         t.master_path`
    : `,\n         NULL::text AS processing_status,\n         NULL::text AS master_path`;

  try {
    const result = await query<TrackRow>(
      `SELECT
         t.album_id AS album_pk,
         t.track_id,
         t.title,
         t.duration,
         t.src,
         t.order_index,
         t.visibility,
         t.stems_visibility,
         t.audio_container,
         t.audio_codec,
         t.audio_bitrate,
         t.audio_sample_rate,
         t.audio_bit_depth,
         t.audio_channels,
         t.audio_duration,
         t.audio_file_size${pipelineCols}
       FROM tracks t
       WHERE t.album_id = ANY($1::uuid[])
       ORDER BY t.order_index ASC`,
      [albumPks]
    );
    for (const row of result.rows) {
      const list = byPk.get(row.album_pk) ?? [];
      list.push(row);
      byPk.set(row.album_pk, list);
    }
    return byPk;
  } catch {
    // Pre-migration fallback: load without optional columns.
    const result = await query<TrackRow>(
      `SELECT
         t.album_id AS album_pk,
         t.track_id,
         t.title,
         t.duration,
         t.src,
         t.order_index,
         NULL::text AS visibility,
         NULL::text AS stems_visibility,
         NULL::text AS audio_container,
         NULL::text AS audio_codec,
         NULL::int AS audio_bitrate,
         NULL::int AS audio_sample_rate,
         NULL::int AS audio_bit_depth,
         NULL::int AS audio_channels,
         NULL::float AS audio_duration,
         NULL::int AS audio_file_size
       FROM tracks t
       WHERE t.album_id = ANY($1::uuid[])
       ORDER BY t.order_index ASC`,
      [albumPks]
    );
    for (const row of result.rows) {
      const list = byPk.get(row.album_pk) ?? [];
      list.push(row);
      byPk.set(row.album_pk, list);
    }
    return byPk;
  }
}

function mapTrackRow(row: TrackRow): AlbumDetailsTrackSource {
  return {
    trackId: row.track_id,
    title: row.title,
    duration: row.duration,
    src: row.src,
    orderIndex:
      typeof row.order_index === 'number' && !Number.isNaN(row.order_index) ? row.order_index : 0,
    visibility: row.visibility,
    stemsVisibility: row.stems_visibility,
    audioContainer: row.audio_container,
    audioCodec: row.audio_codec,
    audioBitrate: row.audio_bitrate,
    audioSampleRate: row.audio_sample_rate,
    audioBitDepth: row.audio_bit_depth,
    audioChannels: row.audio_channels,
    audioDuration: row.audio_duration,
    audioFileSize: row.audio_file_size,
    processingStatus:
      (row.processing_status as AlbumDetailsTrackSource['processingStatus']) ?? null,
  };
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
    const { slug, albumId } = parseSlugAndAlbumId(event);
    if (!slug) {
      return createErrorResponse(400, 'Missing artist slug');
    }
    if (!albumId) {
      return createErrorResponse(400, 'Missing albumId');
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
         a.full_name,
         a.description,
         a.cover,
         a.release,
         a.buttons,
         a.details,
         a.photographer,
         a.photographer_url,
         a.designer,
         a.designer_url,
         a.is_public,
         a.is_published,
         a.lang,
         a.updated_at
       FROM albums a
       WHERE a.user_id = $1 AND a.album_id = $2
       ORDER BY
         CASE a.lang WHEN 'ru' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,
         a.updated_at DESC NULLS LAST,
         a.created_at DESC`,
      [targetUserId, albumId]
    );

    if (albumsResult.rows.length === 0) {
      return createErrorResponse(404, 'Album not found', CORS_HEADERS, {
        code: 'ALBUM_NOT_FOUND',
      });
    }

    const albumPks = albumsResult.rows.map((r) => r.id);
    const [tracksByPk, assetsByTrackId, pipelineAvailable] = await Promise.all([
      fetchTracksForAlbumPks(albumPks),
      fetchTrackAssetsByAlbumPks(albumPks),
      resolvePipelineAvailable(),
    ]);

    const locales: AlbumDetailsLocaleSource[] = albumsResult.rows.map((row) => ({
      lang: row.lang,
      dbAlbumId: row.id,
      userId: row.user_id ?? targetUserId,
      albumId: row.album_id,
      title: row.album ?? '',
      fullName: row.full_name ?? '',
      description: row.description ?? '',
      cover: row.cover ?? '',
      release: row.release,
      buttons: row.buttons,
      details: row.details,
      photographer: String(row.photographer ?? '').trim(),
      photographerURL: String(row.photographer_url ?? '').trim(),
      designer: String(row.designer ?? '').trim(),
      designerURL: String(row.designer_url ?? '').trim(),
      isPublic: row.is_public !== false,
      isPublished: row.is_published === true,
      updatedAt: row.updated_at != null ? new Date(row.updated_at as Date).toISOString() : null,
      tracks: (tracksByPk.get(row.id) ?? []).map(mapTrackRow),
    }));

    const details = mapLocalesToAlbumDetails(locales, {
      hasPremiumAccess,
      monetizationEnabled,
      assetsByTrackId,
      pipelineAvailable,
    });

    if (!details) {
      return createErrorResponse(404, 'Album not found', CORS_HEADERS, {
        code: 'ALBUM_NOT_FOUND',
      });
    }

    if (!isOwnerViewer && !isAlbumDetailsVisibleToPublicViewer(details)) {
      return createErrorResponse(404, 'Album not found', CORS_HEADERS, {
        code: 'ALBUM_NOT_FOUND',
      });
    }

    return createSuccessResponse(details);
  } catch (error) {
    console.error('[artist-album-details]', error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Failed to load album details'
    );
  }
};
