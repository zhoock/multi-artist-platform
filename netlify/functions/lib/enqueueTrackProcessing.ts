/**
 * Enqueue audio processing jobs to the external worker.
 * Failures are returned to callers — never silently ignored when pipeline is active.
 */

import { ENABLED_PIPELINE_STAGE_IDS } from '../../../src/shared/lib/audio/audioAssetPipelineConfig';
import {
  PROCESSING_ERROR_WORKER_NOT_CONFIGURED,
  processingErrorWorkerRejected,
  processingErrorWorkerUnreachable,
} from './trackProcessingErrors';

export interface EnqueueTrackProcessingPayload {
  userId: string;
  albumDbId: string;
  albumSlug: string;
  trackDbId: string;
  trackId: string;
  masterPath: string;
  stages?: string[];
}

export type EnqueueTrackProcessingFailureReason =
  | 'worker_not_configured'
  | 'worker_unreachable'
  | 'worker_rejected';

export type EnqueueTrackProcessingResult =
  | { ok: true }
  | {
      ok: false;
      reason: EnqueueTrackProcessingFailureReason;
      message: string;
    };

export async function enqueueTrackProcessing(
  payload: EnqueueTrackProcessingPayload
): Promise<EnqueueTrackProcessingResult> {
  const workerUrl = (process.env.ASSET_WORKER_URL || '').replace(/\/$/, '');
  const secret = process.env.ASSET_WORKER_WEBHOOK_SECRET || '';

  if (!workerUrl || !secret) {
    const message = PROCESSING_ERROR_WORKER_NOT_CONFIGURED;
    console.error('[enqueueTrackProcessing] Worker not configured — cannot enqueue job', {
      trackId: payload.trackId,
      trackDbId: payload.trackDbId,
      hasWorkerUrl: Boolean(workerUrl),
      hasSecret: Boolean(secret),
    });
    return { ok: false, reason: 'worker_not_configured', message };
  }

  const body = {
    ...payload,
    stages: payload.stages ?? ENABLED_PIPELINE_STAGE_IDS,
  };

  try {
    const res = await fetch(`${workerUrl}/jobs/process-track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const message = processingErrorWorkerRejected(res.status, text.slice(0, 500));
      console.error('[enqueueTrackProcessing] Worker rejected job:', {
        status: res.status,
        trackId: payload.trackId,
        trackDbId: payload.trackDbId,
        body: text.slice(0, 500),
      });
      return { ok: false, reason: 'worker_rejected', message };
    }

    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const message = processingErrorWorkerUnreachable(detail);
    console.error('[enqueueTrackProcessing] Failed to reach worker:', {
      trackId: payload.trackId,
      trackDbId: payload.trackDbId,
      error: detail,
    });
    return { ok: false, reason: 'worker_unreachable', message };
  }
}
