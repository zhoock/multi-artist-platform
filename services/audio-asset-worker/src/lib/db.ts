import type pg from 'pg';
import type { PipelineOutputDefinition } from '../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import {
  GENERATOR_VERSIONS,
  getPlaybackRequiredOutputs,
} from '../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import type { PipelineDb } from '../pipeline/types.js';
import { pipelineTrace, pipelineTraceWarn, type PipelineTraceContext } from './pipelineTrace.js';
import { getPool } from './pool.js';

/** Advisory lock class id for per-track audio processing jobs. */
export const TRACK_PROCESS_LOCK_CLASS = 0x415544; // 'AUD'

type AssetStatusRow = {
  type: string;
  format: string;
  variant: string;
  status: string;
  error: string | null;
};

function buildPlaybackRequiredStatuses(rows: AssetStatusRow[]) {
  const rowByKey = new Map(rows.map((row) => [`${row.type}:${row.format}:${row.variant}`, row]));
  const requiredOutputs = getPlaybackRequiredOutputs();
  return requiredOutputs.map((output) => {
    const key = `${output.type}:${output.format}:${output.variant}`;
    const row = rowByKey.get(key);
    return {
      output,
      status: row?.status ?? 'pending',
      error: row?.error ?? null,
    };
  });
}

export function createPipelineDb(client: pg.PoolClient, trace?: PipelineTraceContext): PipelineDb {
  const logDbWrite = (
    operation: string,
    rowCount: number | null,
    params: Record<string, unknown>
  ) => {
    pipelineTrace(`db.${operation}`, { rowCount, ...params }, trace);
    if (rowCount === 0) {
      pipelineTraceWarn(`db.${operation} ZERO ROWS`, params, trace);
    }
  };

  return {
    async setProcessingStatus(trackDbId, status, error = null) {
      const res = await client.query(
        `UPDATE tracks SET processing_status = $2, processing_error = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [trackDbId, status, error]
      );
      logDbWrite('setProcessingStatus', res.rowCount, { trackDbId, status, error });
    },

    async markAssetProcessing(trackDbId, output: PipelineOutputDefinition) {
      const generatorVersion = GENERATOR_VERSIONS[output.generator] ?? 1;
      const res = await client.query(
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
      logDbWrite('markAssetProcessing', res.rowCount, {
        trackDbId,
        type: output.type,
        format: output.format,
        variant: output.variant,
        generator: output.generator,
        generatorVersion,
      });
    },

    async markAssetReady(trackDbId, output, path, generatorVersion, metadata) {
      const res = await client.query(
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
      logDbWrite('markAssetReady', res.rowCount, {
        trackDbId,
        type: output.type,
        format: output.format,
        variant: output.variant,
        path,
        generatorVersion,
      });
    },

    async markAssetFailed(trackDbId, output, error) {
      const res = await client.query(
        `UPDATE track_assets SET
          status = 'failed',
          error = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE track_id = $1 AND type = $2 AND format = $3 AND variant = $4`,
        [trackDbId, output.type, output.format, output.variant, error.slice(0, 4000)]
      );
      logDbWrite('markAssetFailed', res.rowCount, {
        trackDbId,
        type: output.type,
        format: output.format,
        variant: output.variant,
        error: error.slice(0, 200),
      });
    },

    async syncTrackSrc(trackDbId, publicUrl) {
      const res = await client.query(
        `UPDATE tracks SET src = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [trackDbId, publicUrl]
      );
      logDbWrite('syncTrackSrc', res.rowCount, { trackDbId, publicUrl });
    },

    async snapshotTrackAssets(trackDbId) {
      const res = await client.query<{
        type: string;
        format: string;
        variant: string;
        status: string;
        path: string | null;
      }>(
        `SELECT type, format, variant, status, path
         FROM track_assets
         WHERE track_id = $1
         ORDER BY type, format, variant`,
        [trackDbId]
      );
      pipelineTrace(
        'db.snapshotTrackAssets',
        { trackDbId, rowCount: res.rowCount, rows: res.rows },
        trace
      );
    },

    async getTrackProcessingStatus(trackDbId) {
      const res = await client.query<{ processing_status: string }>(
        `SELECT processing_status FROM tracks WHERE id = $1`,
        [trackDbId]
      );
      const status = res.rows[0]?.processing_status ?? 'pending';
      pipelineTrace('db.getTrackProcessingStatus', { trackDbId, status }, trace);
      return status;
    },

    async getPlaybackRequiredAssetStatuses(trackDbId) {
      const res = await client.query<AssetStatusRow>(
        `SELECT type, format, variant, status, error
         FROM track_assets
         WHERE track_id = $1`,
        [trackDbId]
      );

      const statuses = buildPlaybackRequiredStatuses(res.rows);

      pipelineTrace(
        'db.getPlaybackRequiredAssetStatuses',
        {
          trackDbId,
          requiredCount: statuses.length,
          statuses: statuses.map((s) => ({
            type: s.output.type,
            format: s.output.format,
            variant: s.output.variant,
            status: s.status,
          })),
        },
        trace
      );

      return statuses;
    },

    async countPlaybackRequiredNotReady(trackDbId) {
      const statuses = buildPlaybackRequiredStatuses(
        (
          await client.query<AssetStatusRow>(
            `SELECT type, format, variant, status, error
             FROM track_assets
             WHERE track_id = $1`,
            [trackDbId]
          )
        ).rows
      );
      const count = statuses.filter((s) => s.status !== 'ready').length;
      pipelineTrace('db.countPlaybackRequiredNotReady', { trackDbId, notReadyCount: count }, trace);
      return count;
    },

    async anyPlaybackRequiredFailed(trackDbId) {
      const statuses = buildPlaybackRequiredStatuses(
        (
          await client.query<AssetStatusRow>(
            `SELECT type, format, variant, status, error
             FROM track_assets
             WHERE track_id = $1`,
            [trackDbId]
          )
        ).rows
      );
      const failed = statuses.find((s) => s.status === 'failed');
      pipelineTrace('db.anyPlaybackRequiredFailed', { trackDbId, failed: Boolean(failed) }, trace);
      return failed ?? null;
    },

    async countNotReadyAssets(trackDbId) {
      const res = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM track_assets
         WHERE track_id = $1 AND status <> 'ready'`,
        [trackDbId]
      );
      const count = parseInt(res.rows[0]?.count ?? '0', 10);
      pipelineTrace('db.countNotReadyAssets', { trackDbId, notReadyCount: count }, trace);
      return count;
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
  fn: (db: PipelineDb) => Promise<void>,
  trace?: PipelineTraceContext
): Promise<TrackJobRunResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const lockResult = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock($1, hashtext($2::text)) AS acquired`,
      [TRACK_PROCESS_LOCK_CLASS, trackDbId]
    );

    if (!lockResult.rows[0]?.acquired) {
      pipelineTraceWarn('advisory lock not acquired — job skipped', { trackDbId }, trace);
      return 'skipped';
    }

    pipelineTrace('advisory lock acquired', { trackDbId }, trace);

    const db = createPipelineDb(client, trace);
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
