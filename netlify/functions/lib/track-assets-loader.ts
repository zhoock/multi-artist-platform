/**
 * Load track_assets rows for album page / dashboard resolution.
 */

import { query } from './db';
import type { TrackAssetRecord } from './assetResolver';

export interface TrackAssetDbRow {
  track_id: string;
  type: string;
  format: string;
  variant: string;
  status: string;
  path: string | null;
}

export async function fetchTrackAssetsByAlbumPks(
  albumPks: string[]
): Promise<Map<string, TrackAssetRecord[]>> {
  const byTrackId = new Map<string, TrackAssetRecord[]>();
  if (albumPks.length === 0) return byTrackId;

  try {
    const result = await query<TrackAssetDbRow>(
      `SELECT t.track_id, ta.type, ta.format, ta.variant, ta.status, ta.path
       FROM track_assets ta
       INNER JOIN tracks t ON t.id = ta.track_id
       WHERE t.album_id = ANY($1::uuid[])`,
      [albumPks]
    );

    for (const row of result.rows) {
      const list = byTrackId.get(row.track_id) ?? [];
      list.push({
        type: row.type,
        format: row.format,
        variant: row.variant,
        status: row.status,
        path: row.path,
      });
      byTrackId.set(row.track_id, list);
    }
  } catch (err) {
    console.warn('[track-assets-loader] Failed to load track_assets:', err);
  }

  return byTrackId;
}

export async function resolvePipelineAvailable(): Promise<boolean> {
  return true;
}
