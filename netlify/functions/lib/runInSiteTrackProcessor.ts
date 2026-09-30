/**
 * Runs one audio processing job inside the Netlify background function.
 * The HTTP caller only waits for acceptance; this module performs the work.
 */

import type { ProcessTrackJobPayload } from '../../../services/audio-asset-worker/src/pipeline/types';
import { checkFfmpegToolsAvailable } from '../../../services/audio-asset-worker/src/processors/ffmpegTranscoder';
import { processTrackJobWithRetry } from '../../../services/audio-asset-worker/src/processTrackJobRetry';
import {
  beginTrackProcessingJob,
  finishTrackProcessingJob,
} from '../../../services/audio-asset-worker/src/trackProcessingGate';
import { configureBundledFfmpeg } from './configureBundledFfmpeg';
import {
  inSiteProcessorSignatureMatches,
  resolveAudioProcessorConfig,
} from './resolveAudioProcessor';
import { markTrackProcessingEnqueueFailed } from './trackProcessingFailure';

const REQUIRED_FIELDS = [
  'userId',
  'albumDbId',
  'albumSlug',
  'trackDbId',
  'trackId',
  'masterPath',
] as const;

export type InSiteTrackProcessorResult =
  | { statusCode: 202; body: { accepted: true; duplicate: true; trackId: string } }
  | {
      statusCode: 202;
      body: { accepted: true; trackId: string; result: string };
    }
  | { statusCode: number; body: { error: string } };

export function parseProcessTrackPayload(body: unknown): ProcessTrackJobPayload | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  for (const key of REQUIRED_FIELDS) {
    if (typeof record[key] !== 'string' || !String(record[key]).trim()) {
      return null;
    }
  }
  const stages = Array.isArray(record.stages)
    ? record.stages.filter(
        (stage): stage is string => typeof stage === 'string' && stage.trim().length > 0
      )
    : undefined;

  return {
    userId: String(record.userId),
    albumDbId: String(record.albumDbId),
    albumSlug: String(record.albumSlug),
    trackDbId: String(record.trackDbId),
    trackId: String(record.trackId),
    masterPath: String(record.masterPath),
    ...(stages && stages.length > 0 ? { stages } : {}),
    ...(record.force === true ? { force: true } : {}),
  };
}

function readAuthorization(authorization: string | undefined): string {
  return authorization?.trim() || '';
}

export async function runInSiteTrackProcessor(input: {
  authorization?: string;
  signature?: string;
  rawBody?: string;
  payload: unknown;
}): Promise<InSiteTrackProcessorResult> {
  const processor = resolveAudioProcessorConfig();
  if (!processor.ok) {
    console.error('[process-track-assets] Processor is not configured', {
      missing: processor.missing,
      message: processor.message,
    });
    return { statusCode: 503, body: { error: processor.message } };
  }

  const authorized =
    processor.source === 'netlify-background'
      ? inSiteProcessorSignatureMatches(processor.secret, input.rawBody || '', input.signature)
      : readAuthorization(input.authorization) === `Bearer ${processor.secret}`;
  if (!authorized) {
    console.error('[process-track-assets] Rejected unauthorized processing request');
    return { statusCode: 401, body: { error: 'Unauthorized' } };
  }

  const payload = parseProcessTrackPayload(input.payload);
  if (!payload) {
    return { statusCode: 400, body: { error: 'Missing required processing fields' } };
  }

  if (!beginTrackProcessingJob(payload.trackDbId)) {
    console.warn('[process-track-assets] Duplicate processing request ignored', {
      trackId: payload.trackId,
      trackDbId: payload.trackDbId,
    });
    return {
      statusCode: 202,
      body: { accepted: true, duplicate: true, trackId: payload.trackId },
    };
  }

  try {
    try {
      configureBundledFfmpeg();
      const tools = await checkFfmpegToolsAvailable();
      if (!tools.ffmpeg || !tools.ffprobe) {
        const message = `Audio processor binaries are unavailable (ffmpeg=${String(tools.ffmpeg)}, ffprobe=${String(tools.ffprobe)}).`;
        console.error('[process-track-assets] Cannot start job', {
          trackId: payload.trackId,
          trackDbId: payload.trackDbId,
          message,
        });
        await markTrackProcessingEnqueueFailed(payload.trackDbId, message);
        return { statusCode: 503, body: { error: message } };
      }

      const result = await processTrackJobWithRetry(payload);
      console.log('[process-track-assets] Job finished', {
        trackId: payload.trackId,
        trackDbId: payload.trackDbId,
        result,
      });
      return {
        statusCode: 202,
        body: { accepted: true, trackId: payload.trackId, result },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[process-track-assets] Job threw before completion', {
        trackId: payload.trackId,
        trackDbId: payload.trackDbId,
        error: message,
      });
      await markTrackProcessingEnqueueFailed(payload.trackDbId, message);
      return { statusCode: 500, body: { error: message } };
    }
  } finally {
    finishTrackProcessingJob(payload.trackDbId);
  }
}
