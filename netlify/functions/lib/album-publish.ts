import type { TrackAssetRecord } from './assetResolver';
import { query } from './db';
import {
  evaluateAlbumTracksPublishReadiness,
  type TrackPublishReadinessInput,
} from '../../../src/shared/lib/tracks/trackPublishReadiness';
import { trackAssetsTableExists, tracksTableHasPipelineColumns } from './track-pipeline-schema';

type AlbumPublishCheckRow = {
  album: string | null;
  cover: string | null;
  description: string | null;
  release: Record<string, unknown> | null;
  is_published: boolean;
};

export type AlbumPublishTrackRow = TrackPublishReadinessInput;

function releaseString(release: Record<string, unknown> | null | undefined, key: string): string {
  const value = release?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function releaseGenreCodes(release: Record<string, unknown> | null | undefined): string[] {
  const raw = release?.genreCodes;
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(Boolean);
}

export type AlbumPublishTrackContext = {
  tracks: AlbumPublishTrackRow[];
  assetsByTrackId: Map<string, TrackAssetRecord[]>;
  pipelineAvailable: boolean;
};

export async function loadAlbumPublishTrackContext(
  userId: string,
  albumId: string
): Promise<AlbumPublishTrackContext> {
  const [hasPipeline, hasAssetsTable, albumPksResult] = await Promise.all([
    tracksTableHasPipelineColumns(),
    trackAssetsTableExists(),
    query<{ id: string }>(`SELECT id FROM albums WHERE user_id = $1 AND album_id = $2`, [
      userId,
      albumId,
    ]),
  ]);

  const pipelineAvailable = hasPipeline && hasAssetsTable;
  const albumPks = albumPksResult.rows.map((row) => row.id);
  const assetsByTrackId = new Map<string, TrackAssetRecord[]>();

  if (albumPks.length === 0) {
    return { tracks: [], assetsByTrackId, pipelineAvailable };
  }

  const processingCol = hasPipeline ? ', t.processing_status' : '';
  const tracksResult = await query<{
    track_id: string;
    visibility: string | null;
    stems_visibility: string | null;
    src: string | null;
    processing_status?: string | null;
  }>(
    `SELECT DISTINCT ON (t.track_id)
       t.track_id,
       t.visibility,
       t.stems_visibility,
       t.src${processingCol}
     FROM tracks t
     INNER JOIN albums a ON a.id = t.album_id
     WHERE a.user_id = $1 AND a.album_id = $2
     ORDER BY t.track_id, t.updated_at DESC NULLS LAST, t.created_at DESC`,
    [userId, albumId]
  );

  if (pipelineAvailable) {
    const assetsResult = await query<{
      track_id: string;
      type: string;
      format: string;
      variant: string;
      status: string;
      path: string | null;
    }>(
      `SELECT t.track_id, ta.type, ta.format, ta.variant, ta.status, ta.path
       FROM track_assets ta
       INNER JOIN tracks t ON t.id = ta.track_id
       INNER JOIN albums a ON a.id = t.album_id
       WHERE a.user_id = $1 AND a.album_id = $2`,
      [userId, albumId]
    );

    for (const row of assetsResult.rows) {
      const list = assetsByTrackId.get(row.track_id) ?? [];
      list.push({
        type: row.type,
        format: row.format,
        variant: row.variant,
        status: row.status,
        path: row.path,
      });
      assetsByTrackId.set(row.track_id, list);
    }
  }

  const tracks: AlbumPublishTrackRow[] = tracksResult.rows.map((row) => ({
    trackId: row.track_id,
    visibility: row.visibility,
    stemsVisibility: row.stems_visibility,
    src: row.src,
    processingStatus:
      row.processing_status === 'pending' ||
      row.processing_status === 'processing' ||
      row.processing_status === 'ready' ||
      row.processing_status === 'failed'
        ? row.processing_status
        : null,
  }));

  return { tracks, assetsByTrackId, pipelineAvailable };
}

export function isAlbumMetadataReadyToPublish(album: AlbumPublishCheckRow): boolean {
  if (album.is_published) return false;
  if (!album.album?.trim()) return false;
  if (!album.cover?.trim()) return false;
  if (!album.description?.trim()) return false;

  const release = (album.release ?? {}) as Record<string, unknown>;
  if (!releaseString(release, 'date')) return false;
  if (!releaseString(release, 'UPC')) return false;
  if (releaseGenreCodes(release).length === 0) return false;

  return true;
}

export function isAlbumRowReadyToPublish(
  album: AlbumPublishCheckRow,
  trackContext: AlbumPublishTrackContext
): boolean {
  if (!isAlbumMetadataReadyToPublish(album)) {
    return false;
  }

  return evaluateAlbumTracksPublishReadiness(
    trackContext.tracks,
    trackContext.assetsByTrackId,
    trackContext.pipelineAvailable
  ).ready;
}
