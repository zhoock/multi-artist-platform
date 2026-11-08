import type { PipelineOutputDefinition } from '../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import { runFfmpeg, runFfprobe, type FfprobeResult } from '../processors/ffmpegTranscoder.js';

export function contentTypeForPipelineExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'opus':
      return 'audio/opus';
    case 'm4a':
    case 'aac':
      return 'audio/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'json':
      return 'application/json';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/** Same ffmpeg pass as generate-audio-streams stage (playback-required outputs). */
export async function transcodeLocalFileToPipelineOutput(
  inputPath: string,
  outputPath: string,
  output: PipelineOutputDefinition
): Promise<FfprobeResult> {
  const ffmpegOutputArgs = ['-vn', ...(output.ffmpegArgs ?? [])];
  await runFfmpeg(inputPath, outputPath, ffmpegOutputArgs);
  return runFfprobe(outputPath);
}
