import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runWithTrackProcessingLock } from './lib/db.js';
import { buildPublicStorageUrl, createPipelineStorage } from './lib/storage.js';
import { runPipeline } from './pipeline/runPipeline.js';
import type { PipelineContext, ProcessTrackJobPayload } from './pipeline/types.js';

export type ProcessTrackJobResult = 'completed' | 'skipped' | 'failed';

export async function processTrackJob(
  payload: ProcessTrackJobPayload
): Promise<ProcessTrackJobResult> {
  const runResult = await runWithTrackProcessingLock(payload.trackDbId, async (db) => {
    const storage = createPipelineStorage();
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-asset-'));
    const masterLocalPath = path.join(workDir, 'master');

    try {
      await db.setProcessingStatus(payload.trackDbId, 'processing', null);
      await storage.downloadToFile(payload.masterPath, masterLocalPath);

      const ctx: PipelineContext = {
        userId: payload.userId,
        albumDbId: payload.albumDbId,
        albumSlug: payload.albumSlug,
        trackDbId: payload.trackDbId,
        trackId: payload.trackId,
        masterPath: payload.masterPath,
        masterLocalPath,
        workDir,
        completedAssets: [],
        db,
        storage,
      };

      try {
        await runPipeline(ctx, payload.stages);
        await db.setProcessingStatus(payload.trackDbId, 'ready', null);

        const primary = ctx.completedAssets.find(
          (a) => a.type === 'stream' && a.format === 'opus' && a.variant === '128k'
        );
        if (primary?.storagePath) {
          const publicUrl = buildPublicStorageUrl(primary.storagePath);
          if (publicUrl) {
            await db.syncLegacySrc(payload.trackDbId, publicUrl);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.setProcessingStatus(
          payload.trackDbId,
          ctx.primaryStreamFailed ? 'failed' : 'ready',
          ctx.primaryStreamFailed ? message.slice(0, 4000) : null
        );
        if (ctx.primaryStreamFailed) {
          throw err;
        }
      }
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  if (runResult === 'skipped') {
    return 'skipped';
  }

  return 'completed';
}
