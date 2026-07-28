import type pg from 'pg';
import type { PipelineOutputDefinition } from '../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import { GENERATOR_VERSIONS } from '../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import type { PipelineDb } from '../pipeline/types.js';
import { getPool } from './pool.js';

/** Advisory lock class id for per-track audio processing jobs. */
export const TRACK_PROCESS_LOCK_CLASS = 0x415544; // 'AUD'

export function createPipelineDb(client: pg.PoolClient): PipelineDb {
  return {
    async setProcessingStatus(trackDbId, status, error = null) {
      await client.query(
        `UPDATE tracks SET processing_status = $2, processing_error = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [trackDbId, status, error]
      );
    },

    async markAssetProcessing(trackDbId, output: PipelineOutputDefinition) {
      const generatorVersion = GENERATOR_VERSIONS[output.generator] ?? 1;
      await client.query(
        `INSERT INTO track_assets (
          track_id, type, format, variant, generator, generator_version, status, path, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, 'processing', NULL, '{}')
        ON CONFLICT (track_id, type, format, variant)
        DO UPDATE SET
          generator = EXCLUDED.generator,
          generator_version = EXCLUDED.generator_version,
          status = 'processing',
          error = NULL,
          updated_at = CURRENT_TIMESTAMP`,
        [trackDbId, output.type, output.format, output.variant, output.generator, generatorVersion]
      );
    },

    async markAssetReady(trackDbId, output, path, generatorVersion, metadata) {
      await client.query(
        `UPDATE track_assets SET
          status = 'ready',
          path = $5,
          generator_version = $6,
          metadata = $7::jsonb,
          error = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE track_id = $1 AND type = $2 AND format = $3 AND variant = $4`,
        [
          trackDbId,
          output.type,
          output.format,
          output.variant,
          path,
          generatorVersion,
          JSON.stringify(metadata),
        ]
      );
    },

    async markAssetFailed(trackDbId, output, error) {
      await client.query(
        `UPDATE track_assets SET
          status = 'failed',
          error = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE track_id = $1 AND type = $2 AND format = $3 AND variant = $4`,
        [trackDbId, output.type, output.format, output.variant, error.slice(0, 4000)]
      );
    },

    async syncLegacySrc(trackDbId, publicUrl) {
      await client.query(
        `UPDATE tracks SET src = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [trackDbId, publicUrl]
      );
    },
  };
}

export type TrackJobRunResult = 'completed' | 'skipped';

/**
 * Acquire a session-level advisory lock for one track, run the job, then release.
 * Returns 'skipped' when another worker already holds the lock (dedupe).
 */
export async function runWithTrackProcessingLock(
  trackDbId: string,
  fn: (db: PipelineDb) => Promise<void>
): Promise<TrackJobRunResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const lockResult = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock($1, hashtext($2::text)) AS acquired`,
      [TRACK_PROCESS_LOCK_CLASS, trackDbId]
    );

    if (!lockResult.rows[0]?.acquired) {
      return 'skipped';
    }

    const db = createPipelineDb(client);
    await fn(db);
    return 'completed';
  } finally {
    await client
      .query(`SELECT pg_advisory_unlock($1, hashtext($2::text))`, [
        TRACK_PROCESS_LOCK_CLASS,
        trackDbId,
      ])
      .catch(() => {});
    client.release();
  }
}
