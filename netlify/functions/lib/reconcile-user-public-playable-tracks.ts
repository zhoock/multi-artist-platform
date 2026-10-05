/**
 * Runs existing playback Storage reconciliation for every public playable track (`ready`, not
 * hidden) on published public albums for one artist. Public catalog/search gates read DB status
 * only — this closes the window before those queries run.
 */

import type { ProcessingStatus } from '../../../src/shared/lib/audio/audioAssetPipelineConfig';
import { normalizeTrackIdString } from '../../../src/shared/lib/tracks/normalizeTrackIdString';
import { query } from './db';
import { publicPlayableTrackSql } from './public-track-sql';
import { fetchTrackAssetsByAlbumPks } from './track-assets-loader';
import { reconcileAlbumPlaybackStorageBatch } from './track-playback-storage-reconcile';

interface PlayableTrackRow {
  album_pk: string;
  album_slug: string;
  track_id: string;
  processing_status: string | null;
}

export async function reconcileUserPublicPlayableTracks(userId: string): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;

  const result = await query<PlayableTrackRow>(
    `SELECT
       a.id AS album_pk,
       a.album_id AS album_slug,
       t.track_id,
       t.processing_status
     FROM tracks t
     INNER JOIN albums a ON t.album_id = a.id
     WHERE a.user_id = $1::uuid
       AND a.is_published = true
       AND a.is_public = true
       AND btrim(COALESCE(a.album, '')) <> ''
       AND ${publicPlayableTrackSql('t')}`,
    [uid],
    0
  );

  if (result.rows.length === 0) return;

  const albumPks = [...new Set(result.rows.map((row) => row.album_pk))];
  let assetsByTrackId = await fetchTrackAssetsByAlbumPks(albumPks);

  const byAlbumSlug = new Map<string, PlayableTrackRow[]>();
  for (const row of result.rows) {
    const slug = String(row.album_slug ?? '').trim();
    if (!slug) continue;
    const list = byAlbumSlug.get(slug) ?? [];
    list.push(row);
    byAlbumSlug.set(slug, list);
  }

  for (const [albumSlug, rows] of byAlbumSlug) {
    const reconcileInputs: Array<{
      logicalTrackId: string;
      processingStatus: ProcessingStatus | null | undefined;
    }> = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const logicalTrackId = normalizeTrackIdString(row.track_id) || String(row.track_id);
      if (seen.has(logicalTrackId)) continue;
      seen.add(logicalTrackId);
      reconcileInputs.push({
        logicalTrackId,
        processingStatus: row.processing_status as ProcessingStatus | null,
      });
    }

    const reconciled = await reconcileAlbumPlaybackStorageBatch(
      uid,
      albumSlug,
      reconcileInputs,
      assetsByTrackId
    );
    assetsByTrackId = reconciled.assetsByTrackId;
  }
}
