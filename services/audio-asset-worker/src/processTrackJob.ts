import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ENABLED_PIPELINE_STAGE_IDS,
  isOptionalOnlyPipelineRun,
} from '../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import { shouldSkipReadyTrackReprocess } from '../../../src/shared/lib/audio/shouldSkipReadyTrackReprocess.js';
import { finalizeTrackProcessingStatus } from './finalizeTrackProcessingStatus.js';
import { runWithTrackProcessingLock } from './lib/db.js';
import { pipelineTrace, pipelineTraceWarn } from './lib/pipelineTrace.js';
import { buildPublicStorageUrl, createPipelineStorage } from './lib/storage.js';
import { runPipeline } from './pipeline/runPipeline.js';
import type { PipelineContext, ProcessTrackJobPayload } from './pipeline/types.js';

export type ProcessTrackJobResult = 'completed' | 'skipped' | 'failed' | 'already_ready';

export async function processTrackJob(
  payload: ProcessTrackJobPayload
): Promise<ProcessTrackJobResult> {
  const trace = { trackDbId: payload.trackDbId, trackId: payload.trackId };
  let jobFailed = false;
  let alreadyReady = false;

  pipelineTrace(
    'processTrackJob start',
    {
      albumSlug: payload.albumSlug,
      masterPath: payload.masterPath,
      stages: payload.stages ?? '(default)',
    },
    trace
  );

  const runResult = await runWithTrackProcessingLock(
    payload.trackDbId,
    async (db) => {
      const stageIds = payload.stages ?? ENABLED_PIPELINE_STAGE_IDS;
      const optionalOnlyJob = isOptionalOnlyPipelineRun(stageIds);
      const currentStatus = await db.getTrackProcessingStatus(payload.trackDbId);
      if (
        shouldSkipReadyTrackReprocess({
          processingStatus: currentStatus,
          optionalOnly: optionalOnlyJob,
          force: payload.force,
        })
      ) {
        alreadyReady = true;
        pipelineTrace('track already ready — skipping reprocess', undefined, trace);
        return;
      }

      const storage = createPipelineStorage();
      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-asset-'));
      const masterLocalPath = path.join(workDir, 'master');

      try {
        if (!optionalOnlyJob) {
          pipelineTrace('setting track status processing', undefined, trace);
          await db.setProcessingStatus(payload.trackDbId, 'processing', null);
        } else {
          const optionalStatus = await db.getTrackProcessingStatus(payload.trackDbId);
          if (optionalStatus !== 'ready') {
            pipelineTrace(
              'optional-only job on non-ready track — setting processing',
              { currentStatus: optionalStatus },
              trace
            );
            await db.setProcessingStatus(payload.trackDbId, 'processing', null);
          } else {
            pipelineTrace(
              'optional-only job on ready track — preserving processing_status',
              undefined,
              trace
            );
          }
        }

        pipelineTrace('downloading master', { masterPath: payload.masterPath }, trace);
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

        let pipelineError: string | null = null;

        try {
          await runPipeline(ctx, stageIds);
          pipelineTrace(
            'runPipeline returned',
            {
              completedAssetsInMemory: ctx.completedAssets.map((a) => ({
                type: a.type,
                format: a.format,
                variant: a.variant,
                storagePath: a.storagePath,
              })),
            },
            trace
          );
        } catch (err) {
          pipelineError = err instanceof Error ? err.message : String(err);
          pipelineTraceWarn('runPipeline threw', { error: pipelineError }, trace);
          jobFailed = true;
        }

        const finalStatus = await finalizeTrackProcessingStatus(db, payload.trackDbId, trace, {
          pipelineError,
        });

        if (finalStatus === 'ready') {
          const primary = ctx.completedAssets.find(
            (a) => a.type === 'stream' && a.format === 'opus' && a.variant === '128k'
          );
          if (primary?.storagePath) {
            const publicUrl = buildPublicStorageUrl(primary.storagePath);
            if (publicUrl) {
              await db.syncTrackSrc(payload.trackDbId, publicUrl);
            }
          }
          pipelineTrace('processTrackJob success path completed', undefined, trace);
        } else if (finalStatus === 'failed') {
          jobFailed = true;
        }
      } finally {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    },
    trace
  );

  if (runResult === 'skipped') {
    pipelineTraceWarn('processTrackJob skipped (duplicate lock)', undefined, trace);
    return 'skipped';
  }

  if (alreadyReady) {
    pipelineTrace('processTrackJob finished', { result: 'already_ready' }, trace);
    return 'already_ready';
  }

  pipelineTrace('processTrackJob finished', { result: jobFailed ? 'failed' : 'completed' }, trace);
  return jobFailed ? 'failed' : 'completed';
}
