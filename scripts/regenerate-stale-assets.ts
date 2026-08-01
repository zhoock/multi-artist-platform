/**
 * Bulk-regenerate stale track_assets by generator version.
 *
 * Does NOT reset asset rows before enqueue — worker marks `processing` after lock.
 *
 * Usage: tsx scripts/regenerate-stale-assets.ts --generator=ffmpeg-opus [--dry-run]
 */

import { query } from '../netlify/functions/lib/db';
import { enqueueTrackProcessing } from '../netlify/functions/lib/enqueueTrackProcessing';
import {
  GENERATOR_VERSIONS,
  getStageIdsForGenerator,
} from '../src/shared/lib/audio/audioAssetPipelineConfig';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const generatorArg = process.argv.find((a) => a.startsWith('--generator='));
  const generator = generatorArg?.split('=')[1]?.trim() || 'ffmpeg-opus';
  const currentVersion = GENERATOR_VERSIONS[generator] ?? 1;
  const stages = getStageIdsForGenerator(generator);

  if (stages.length === 0) {
    console.error(`Unknown generator: ${generator}`);
    process.exit(1);
  }

  const stale = await query<{
    track_db_id: string;
    track_id: string;
    master_path: string;
    album_db_id: string;
    album_slug: string;
    user_id: string;
  }>(
    `SELECT DISTINCT t.id AS track_db_id, t.track_id, t.master_path,
            a.id AS album_db_id, a.album_id AS album_slug, a.user_id
     FROM track_assets ta
     INNER JOIN tracks t ON t.id = ta.track_id
     INNER JOIN albums a ON a.id = t.album_id
     WHERE ta.generator = $1
       AND ta.generator_version < $2
       AND t.master_path IS NOT NULL`,
    [generator, currentVersion]
  );

  console.log(`Stale ${generator} assets: ${stale.rows.length} tracks`);

  for (const row of stale.rows) {
    if (dryRun) {
      console.log(`Would regenerate ${row.track_id} (${row.album_slug})`);
      continue;
    }

    await enqueueTrackProcessing({
      userId: row.user_id,
      albumDbId: row.album_db_id,
      albumSlug: row.album_slug,
      trackDbId: row.track_db_id,
      trackId: row.track_id,
      masterPath: row.master_path,
      stages,
    });
  }

  console.log(dryRun ? 'Dry run complete.' : 'Regeneration enqueued.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
