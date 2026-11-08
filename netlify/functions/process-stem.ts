/**
 * POST /api/stems/process
 * Transcodes an uploaded stem master (original/) to stream/opus/128k and removes the master.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { checkFfmpegToolsAvailable } from '../../services/audio-asset-worker/src/processors/ffmpegTranscoder';
import { processStemJob } from '../../services/audio-asset-worker/src/processStemJob';
import {
  beginStemProcessingJob,
  finishStemProcessingJob,
} from '../../services/audio-asset-worker/src/stemProcessingGate';
import {
  buildStemMasterStoragePath,
  buildStemPlaybackFileName,
} from '../../src/shared/lib/stems/stemStoragePaths';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  parseJsonBody,
  requireArtistAccount,
  forbiddenArtistAccountResponse,
  unauthorizedFromAuthHeader,
  requireAuth,
} from './lib/api-helpers';
import { configureBundledFfmpeg } from './lib/configureBundledFfmpeg';
import { assertOwnedStemStoragePath } from './lib/stem-storage-path';
import { STEMS_MANIFEST_FILE } from './lib/stem-storage-path-shared';

interface ProcessStemRequest {
  albumId: string;
  trackId: string;
  masterFileName: string;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  const userId = requireArtistAccount(event);
  if (!userId) {
    return requireAuth(event)
      ? forbiddenArtistAccountResponse(event)
      : unauthorizedFromAuthHeader(event);
  }

  const { guardUserEmailVerifiedForUpload } = await import('./lib/email-verification');
  const emailGuardResponse = await guardUserEmailVerifiedForUpload(userId);
  if (emailGuardResponse) {
    return emailGuardResponse;
  }

  const body = parseJsonBody<Partial<ProcessStemRequest>>(event.body, {});
  const albumId = body.albumId?.trim();
  const trackId = body.trackId?.trim();
  const masterFileName = body.masterFileName?.trim();

  if (!albumId || !trackId || !masterFileName) {
    return createErrorResponse(400, 'Missing required fields: albumId, trackId, masterFileName');
  }

  if (masterFileName === STEMS_MANIFEST_FILE || masterFileName.includes('/')) {
    return createErrorResponse(400, 'Invalid masterFileName');
  }

  const masterPath = buildStemMasterStoragePath(userId, albumId, trackId, masterFileName);

  try {
    assertOwnedStemStoragePath(masterPath, userId);
  } catch {
    return createErrorResponse(403, 'Invalid stem storage path');
  }

  if (!beginStemProcessingJob(masterPath)) {
    return createErrorResponse(409, 'Stem processing already in progress for this file');
  }

  try {
    configureBundledFfmpeg();
    const tools = await checkFfmpegToolsAvailable();
    if (!tools.ffmpeg || !tools.ffprobe) {
      return createErrorResponse(
        503,
        'Audio processor is unavailable on this deploy (ffmpeg/ffprobe missing).'
      );
    }

    const result = await processStemJob({
      userId,
      albumId,
      trackId,
      masterPath,
      masterFileName,
    });

    return createSuccessResponse({
      fileName: result.fileName,
      storagePath: result.playbackPath,
      fileSize: result.fileSize,
      duration: result.duration,
      playbackFileName: buildStemPlaybackFileName(masterFileName),
    });
  } catch (error) {
    console.error('❌ [process-stem]', error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Stem processing failed'
    );
  } finally {
    finishStemProcessingJob(masterPath);
  }
};
