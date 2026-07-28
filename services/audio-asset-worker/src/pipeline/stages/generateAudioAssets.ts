import type { PipelineOutputDefinition } from '../../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import {
  GENERATOR_VERSIONS,
  PIPELINE_STAGES,
} from '../../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import {
  buildDerivedStoragePath,
  replaceStorageFileExtension,
} from '../../../../../src/shared/lib/tracks/trackStoragePaths.js';
import { runFfmpeg, runFfprobe } from '../../processors/ffmpegTranscoder.js';
import type { PipelineContext, PipelineStage } from '../types.js';

export const generateAudioAssetsStage: PipelineStage = {
  stageId: 'generate-audio-streams',
  async run(ctx) {
    const stage = PIPELINE_STAGES.find((s) => s.stageId === 'generate-audio-streams');
    if (!stage) return ctx;

    const masterFileName = ctx.masterPath.split('/').pop() || 'track.audio';

    for (const output of stage.outputs) {
      await processFfmpegOutput(ctx, output, masterFileName);
    }
    return ctx;
  },
};

export const generateWaveformStage: PipelineStage = {
  stageId: 'generate-waveform',
  async run(ctx) {
    return ctx;
  },
};

export const generatePreviewStage: PipelineStage = {
  stageId: 'generate-preview',
  async run(ctx) {
    return ctx;
  },
};

async function processFfmpegOutput(
  ctx: PipelineContext,
  output: PipelineOutputDefinition,
  masterFileName: string
): Promise<void> {
  const derivedFileName = replaceStorageFileExtension(masterFileName, output.extension);
  const storagePath = buildDerivedStoragePath(
    ctx.userId,
    ctx.albumSlug,
    output.type,
    output.format,
    output.variant,
    derivedFileName
  );

  const localOut = `${ctx.workDir}/${output.type}_${output.format}_${output.variant}.${output.extension}`;

  await ctx.db.markAssetProcessing(ctx.trackDbId, output);

  try {
    const ffmpegOutputArgs = ['-vn', ...(output.ffmpegArgs ?? [])];
    await runFfmpeg(ctx.masterLocalPath, localOut, ffmpegOutputArgs);
    const probe = await runFfprobe(localOut);

    await ctx.storage.uploadFile(storagePath, localOut, contentTypeForExtension(output.extension));

    const generatorVersion = GENERATOR_VERSIONS[output.generator] ?? 1;
    ctx.completedAssets.push({
      ...output,
      storagePath,
      generatorVersion,
      metadata: {
        bitrate: probe.bitrate,
        sampleRate: probe.sampleRate,
        channels: probe.channels,
        duration: probe.duration,
        fileSize: probe.fileSize,
        codec: probe.codec,
      },
    });

    await ctx.db.markAssetReady(ctx.trackDbId, output, storagePath, generatorVersion, {
      bitrate: probe.bitrate,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      duration: probe.duration,
      fileSize: probe.fileSize,
      codec: probe.codec,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.db.markAssetFailed(ctx.trackDbId, output, message);
    if (output.type === 'stream' && output.variant === '128k') {
      ctx.primaryStreamFailed = true;
      ctx.primaryStreamError = message;
    }
    throw err;
  }
}

function contentTypeForExtension(ext: string): string {
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
