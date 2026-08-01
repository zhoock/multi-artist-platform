import {
  ENABLED_PIPELINE_STAGE_IDS,
  getGeneratorsForStageIds,
} from '../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import {
  logOperationalEvent,
  OPERATIONAL_EVENT_LOCK_RETRIES_EXHAUSTED,
} from './lib/logOperationalEvent.js';
import { pipelineTrace, pipelineTraceWarn } from './lib/pipelineTrace.js';
import { processTrackJob, type ProcessTrackJobResult } from './processTrackJob.js';
import type { ProcessTrackJobPayload } from './pipeline/types.js';

const SKIP_RETRY_MAX_ATTEMPTS = 6;
const SKIP_RETRY_BASE_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveStageIds(payload: ProcessTrackJobPayload): string[] {
  return payload.stages ?? ENABLED_PIPELINE_STAGE_IDS;
}

function logLockRetriesExhausted(payload: ProcessTrackJobPayload, attempts: number): void {
  const stages = resolveStageIds(payload);
  logOperationalEvent({
    event: OPERATIONAL_EVENT_LOCK_RETRIES_EXHAUSTED,
    level: 'error',
    trackId: payload.trackId,
    trackDbId: payload.trackDbId,
    albumSlug: payload.albumSlug,
    stages,
    generators: getGeneratorsForStageIds(stages),
    attempts,
    reason: 'advisory_lock_not_acquired',
  });
}

/**
 * Retry when advisory lock is held — avoids leaving assets in pre-reset pending if callers
 * enqueue before lock (regenerate must not reset DB until worker runs).
 */
export async function processTrackJobWithRetry(
  payload: ProcessTrackJobPayload,
  options?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<ProcessTrackJobResult> {
  const maxAttempts = options?.maxAttempts ?? SKIP_RETRY_MAX_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? SKIP_RETRY_BASE_DELAY_MS;
  const trace = { trackDbId: payload.trackDbId, trackId: payload.trackId };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await processTrackJob(payload);
    if (result !== 'skipped') {
      return result;
    }

    if (attempt >= maxAttempts) {
      pipelineTraceWarn(
        'processTrackJobWithRetry exhausted skip retries',
        { attempt, maxAttempts },
        trace
      );
      logLockRetriesExhausted(payload, maxAttempts);
      return 'skipped';
    }

    const delayMs = baseDelayMs * attempt;
    pipelineTrace(
      'processTrackJob skipped — scheduling retry',
      { attempt, nextAttempt: attempt + 1, delayMs },
      trace
    );
    await sleep(delayMs);
  }

  return 'skipped';
}
