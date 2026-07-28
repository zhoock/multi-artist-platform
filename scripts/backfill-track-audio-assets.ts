/**
 * Backfill master_path and enqueue processing for legacy tracks.
 *
 * Usage: tsx scripts/backfill-track-audio-assets.ts [--dry-run] [--limit=100]
 */

import { query } from '../netlify/functions/lib/db';
import { enqueueTrackProcessing } from '../netlify/functions/lib/enqueueTrackProcessing';
import { tracksTableHasPipelineColumns } from '../netlify/functions/lib/track-pipeline-schema';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? '100', 10) : 100;

  const hasPipeline = await tracksTableHasPipelineColumns();
  if (!hasPipeline) {
    console.error('Migration 064 not applied — master_path column missing.');
    process.exit(1);
  }

  const result = await query<{
    id: string;
    track_id: string;
    src: string | null;
    master_path: string | null;
    album_db_id: string;
    album_slug: string;
    user_id: string;
  }>(
    `SELECT t.id, t.track_id, t.src, t.master_path,
            a.id AS album_db_id, a.album_id AS album_slug, a.user_id
     FROM tracks t
     INNER JOIN albums a ON a.id = t.album_id
     WHERE t.src IS NOT NULL AND trim(t.src) <> ''
       AND (t.master_path IS NULL OR trim(t.master_path) = '')
       AND t.processing_status IN ('pending', 'failed', 'ready')
     ORDER BY t.updated_at DESC
     LIMIT $1`,
    [limit]
  );

  console.log(`Found ${result.rows.length} tracks to backfill (limit ${limit})`);

  for (const row of result.rows) {
    const masterPath = row.src!.trim();
    console.log(
      `Track ${row.track_id} (${row.album_slug}) → master_path=${masterPath.slice(0, 80)}…`
    );

    if (dryRun) continue;

    await query(
      `UPDATE tracks SET master_path = $2, processing_status = 'pending', processing_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [row.id, masterPath]
    );

    await enqueueTrackProcessing({
      userId: row.user_id,
      albumDbId: row.album_db_id,
      albumSlug: row.album_slug,
      trackDbId: row.id,
      trackId: row.track_id,
      masterPath,
    });
  }

  console.log(dryRun ? 'Dry run complete.' : 'Backfill enqueue complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
