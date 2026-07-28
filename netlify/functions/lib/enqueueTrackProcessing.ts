/**
 * Fire-and-forget enqueue of audio processing jobs to the external worker.
 */

import { ENABLED_PIPELINE_STAGE_IDS } from '../../../src/shared/lib/audio/audioAssetPipelineConfig';

export interface EnqueueTrackProcessingPayload {
  userId: string;
  albumDbId: string;
  albumSlug: string;
  trackDbId: string;
  trackId: string;
  masterPath: string;
  stages?: string[];
}

export async function enqueueTrackProcessing(
  payload: EnqueueTrackProcessingPayload
): Promise<void> {
  const workerUrl = (process.env.ASSET_WORKER_URL || '').replace(/\/$/, '');
  const secret = process.env.ASSET_WORKER_WEBHOOK_SECRET || '';

  if (!workerUrl || !secret) {
    console.warn(
      '[enqueueTrackProcessing] ASSET_WORKER_URL or ASSET_WORKER_WEBHOOK_SECRET not set — skipping job',
      { trackId: payload.trackId }
    );
    return;
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
      console.error('[enqueueTrackProcessing] Worker rejected job:', {
        status: res.status,
        trackId: payload.trackId,
        body: text.slice(0, 500),
      });
    }
  } catch (err) {
    console.error('[enqueueTrackProcessing] Failed to reach worker:', {
      trackId: payload.trackId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
