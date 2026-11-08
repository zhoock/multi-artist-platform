import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPipelineOutput } from '../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import {
  buildStemPlaybackFileName,
  getStemStoragePath,
} from '../../../src/shared/lib/stems/stemStoragePaths.js';
import { createPipelineStorage } from './lib/storage.js';
import {
  contentTypeForPipelineExtension,
  transcodeLocalFileToPipelineOutput,
} from './pipeline/transcodePipelineOutput.js';

export interface ProcessStemJobPayload {
  userId: string;
  albumId: string;
  trackId: string;
  masterPath: string;
  /** Base name used for master upload; playback name is derived (stream/opus/128k). */
  masterFileName: string;
}

export interface ProcessStemJobResult {
  fileName: string;
  playbackPath: string;
  fileSize: number;
  duration: number | null;
}

export async function processStemJob(
  payload: ProcessStemJobPayload
): Promise<ProcessStemJobResult> {
  const playbackOutput = findPipelineOutput('stream', 'opus', '128k');
  if (!playbackOutput) {
    throw new Error('Playback pipeline output stream/opus/128k is not configured');
  }

  const playbackFileName = buildStemPlaybackFileName(payload.masterFileName);
  const playbackPath = getStemStoragePath(
    payload.userId,
    payload.albumId,
    payload.trackId,
    playbackFileName
  );

  const storage = createPipelineStorage();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stem-audio-'));
  const masterLocalPath = path.join(workDir, 'master');
  const localOut = path.join(workDir, `playback.${playbackOutput.extension}`);

  try {
    await storage.downloadToFile(payload.masterPath, masterLocalPath);
    const probe = await transcodeLocalFileToPipelineOutput(
      masterLocalPath,
      localOut,
      playbackOutput
    );
    await storage.uploadFile(
      playbackPath,
      localOut,
      contentTypeForPipelineExtension(playbackOutput.extension)
    );
    await storage.removeFile(payload.masterPath);

    return {
      fileName: playbackFileName,
      playbackPath,
      fileSize: probe.fileSize ?? 0,
      duration: probe.duration,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
