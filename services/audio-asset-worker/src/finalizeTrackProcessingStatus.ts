import type { PipelineDb } from './pipeline/types.js';
import {
  pipelineTrace,
  pipelineTraceWarn,
  type PipelineTraceContext,
} from './lib/pipelineTrace.js';

/**
 * Set tracks.processing_status from DB truth — never mark ready unless all track_assets are ready.
 */
export async function finalizeTrackProcessingStatus(
  db: PipelineDb,
  trackDbId: string,
  trace: PipelineTraceContext,
  options?: { pipelineError?: string | null }
): Promise<'ready' | 'failed'> {
  await db.snapshotTrackAssets(trackDbId);
  const notReadyCount = await db.countNotReadyAssets(trackDbId);

  if (notReadyCount === 0) {
    await db.setProcessingStatus(trackDbId, 'ready', null);
    pipelineTrace(
      'finalizeTrackProcessingStatus → ready (all assets ready in DB)',
      undefined,
      trace
    );
    return 'ready';
  }

  const errorMessage =
    options?.pipelineError?.slice(0, 4000) ?? `${notReadyCount} track asset(s) are not ready`;

  await db.setProcessingStatus(trackDbId, 'failed', errorMessage);
  pipelineTraceWarn(
    'finalizeTrackProcessingStatus → failed (assets not ready in DB)',
    { notReadyCount, pipelineError: options?.pipelineError ?? null },
    trace
  );
  return 'failed';
}
