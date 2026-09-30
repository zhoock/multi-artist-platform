/**
 * Enqueue audio processing jobs to the external worker.
 * Failures are returned to callers — never silently ignored when pipeline is active.
 */

import { ENABLED_PIPELINE_STAGE_IDS } from '../../../src/shared/lib/audio/audioAssetPipelineConfig';
import { resolveAudioProcessorConfig, signInSiteProcessorBody } from './resolveAudioProcessor';
import {
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
  const processor = resolveAudioProcessorConfig();

  if (!processor.ok) {
    console.error('[enqueueTrackProcessing] Worker not configured — cannot enqueue job', {
      trackId: payload.trackId,
      trackDbId: payload.trackDbId,
      missing: processor.missing,
      hasWorkerUrl: Boolean(process.env.ASSET_WORKER_URL?.trim()),
      hasSecret: Boolean(process.env.ASSET_WORKER_WEBHOOK_SECRET?.trim()),
      context: process.env.CONTEXT || null,
    });
    return { ok: false, reason: 'worker_not_configured', message: processor.message };
  }

  if (processor.source === 'netlify-background') {
    console.warn(
      '[enqueueTrackProcessing] ASSET_WORKER_URL is not set. Local .env is not deployed to Netlify, so this runtime is starting the in-site audio processor.',
      {
        trackId: payload.trackId,
        trackDbId: payload.trackDbId,
        mode: processor.mode,
      }
    );
  }

  const body = {
    ...payload,
    stages: payload.stages ?? ENABLED_PIPELINE_STAGE_IDS,
  };
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (processor.source === 'netlify-background') {
    headers['X-Audio-Processor-Signature'] = signInSiteProcessorBody(processor.secret, rawBody);
  } else {
    headers.Authorization = `Bearer ${processor.secret}`;
  }

  try {
    const res = await fetch(processor.endpoint, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(8_000),
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
