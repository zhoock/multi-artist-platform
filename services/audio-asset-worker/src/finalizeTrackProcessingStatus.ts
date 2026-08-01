import type { PipelineDb } from './pipeline/types.js';
import {
  pipelineTrace,
  pipelineTraceWarn,
  type PipelineTraceContext,
} from './lib/pipelineTrace.js';

/**
 * Set tracks.processing_status from playback-required assets only.
 * Optional assets (waveform) never gate track readiness — see docs/architecture/audio-asset-pipeline.md.
 */
export async function finalizeTrackProcessingStatus(
  db: PipelineDb,
  trackDbId: string,
  trace: PipelineTraceContext,
  options?: { pipelineError?: string | null }
): Promise<'ready' | 'failed' | 'processing'> {
  await db.snapshotTrackAssets(trackDbId);
  const requiredStatuses = await db.getPlaybackRequiredAssetStatuses(trackDbId);

  const failedRequired = requiredStatuses.find((row) => row.status === 'failed');
  if (failedRequired) {
    const errorMessage =
      options?.pipelineError?.slice(0, 4000) ??
      failedRequired.error?.slice(0, 4000) ??
      'Playback-required asset processing failed';

    await db.setProcessingStatus(trackDbId, 'failed', errorMessage);
    pipelineTraceWarn(
      'finalizeTrackProcessingStatus → failed (playback-required asset failed)',
      {
        asset: {
          type: failedRequired.output.type,
          format: failedRequired.output.format,
          variant: failedRequired.output.variant,
        },
        pipelineError: options?.pipelineError ?? null,
      },
      trace
    );
    return 'failed';
  }

  const allRequiredReady =
    requiredStatuses.length > 0 && requiredStatuses.every((row) => row.status === 'ready');

  if (allRequiredReady) {
    await db.setProcessingStatus(trackDbId, 'ready', null);
    pipelineTrace(
      'finalizeTrackProcessingStatus → ready (playback-required assets ready)',
      undefined,
      trace
    );
    return 'ready';
  }

  if (options?.pipelineError) {
    const errorMessage = options.pipelineError.slice(0, 4000);
    await db.setProcessingStatus(trackDbId, 'failed', errorMessage);
    pipelineTraceWarn(
      'finalizeTrackProcessingStatus → failed (pipeline error, required assets not ready)',
      { pipelineError: errorMessage },
      trace
    );
    return 'failed';
  }

  await db.setProcessingStatus(trackDbId, 'processing', null);
  pipelineTrace(
    'finalizeTrackProcessingStatus → processing (playback-required assets not ready)',
    {
      requiredStatuses: requiredStatuses.map((row) => ({
        type: row.output.type,
        format: row.output.format,
        variant: row.output.variant,
        status: row.status,
      })),
    },
    trace
  );
  return 'processing';
}
