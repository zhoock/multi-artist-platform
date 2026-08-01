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
import { generateWaveformPeaksJsonFile } from '../../processors/waveformPeaksFromAudio.js';
import {
  pipelineTrace,
  pipelineTraceWarn,
  type PipelineTraceContext,
} from '../../lib/pipelineTrace.js';
import type { PipelineContext, PipelineStage } from '../types.js';

export const generateAudioAssetsStage: PipelineStage = {
  stageId: 'generate-audio-streams',
  async run(ctx) {
    const trace: PipelineTraceContext = {
      trackDbId: ctx.trackDbId,
      trackId: ctx.trackId,
    };
    const stage = PIPELINE_STAGES.find((s) => s.stageId === 'generate-audio-streams');
    if (!stage) {
      pipelineTraceWarn('generate-audio-streams stage definition missing', undefined, trace);
      return ctx;
    }

    pipelineTrace(
      'generate-audio-streams entered',
      { outputCount: stage.outputs.length, masterPath: ctx.masterPath },
      trace
    );

    const masterFileName = ctx.masterPath.split('/').pop() || 'track.audio';

    for (const output of stage.outputs) {
      pipelineTrace(
        'generate-audio-streams processing output',
        {
          trackDbId: ctx.trackDbId,
          type: output.type,
          format: output.format,
          variant: output.variant,
          generator: output.generator,
        },
        trace
      );
      await processFfmpegOutput(ctx, output, masterFileName, trace);
    }

    pipelineTrace(
      'generate-audio-streams finished',
      { completedAssets: ctx.completedAssets.length },
      trace
    );
    return ctx;
  },
};

export const generateWaveformStage: PipelineStage = {
  stageId: 'generate-waveform',
  async run(ctx) {
    const trace: PipelineTraceContext = {
      trackDbId: ctx.trackDbId,
      trackId: ctx.trackId,
    };
    const stage = PIPELINE_STAGES.find((s) => s.stageId === 'generate-waveform');
    if (!stage) {
      pipelineTraceWarn('generate-waveform stage definition missing', undefined, trace);
      return ctx;
    }

    pipelineTrace(
      'generate-waveform entered',
      { outputCount: stage.outputs.length, masterPath: ctx.masterPath },
      trace
    );

    const masterFileName = ctx.masterPath.split('/').pop() || 'track.audio';

    for (const output of stage.outputs) {
      await processWaveformOutput(ctx, output, masterFileName, trace);
    }

    pipelineTrace(
      'generate-waveform finished',
      { completedAssets: ctx.completedAssets.length },
      trace
    );
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
  masterFileName: string,
  trace: PipelineTraceContext
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

  pipelineTrace('markAssetProcessing calling', { storagePath, localOut }, trace);
  await ctx.db.markAssetProcessing(ctx.trackDbId, output);

  try {
    pipelineTrace('running ffmpeg', { input: ctx.masterLocalPath, output: localOut }, trace);
    const ffmpegOutputArgs = ['-vn', ...(output.ffmpegArgs ?? [])];
    await runFfmpeg(ctx.masterLocalPath, localOut, ffmpegOutputArgs);

    pipelineTrace('running ffprobe on derived file', { localOut }, trace);
    const probe = await runFfprobe(localOut);

    pipelineTrace(
      'uploading to storage',
      { storagePath, contentType: contentTypeForExtension(output.extension) },
      trace
    );
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

    pipelineTrace('markAssetReady calling', { storagePath, generatorVersion }, trace);
    await ctx.db.markAssetReady(ctx.trackDbId, output, storagePath, generatorVersion, {
      bitrate: probe.bitrate,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      duration: probe.duration,
      fileSize: probe.fileSize,
      codec: probe.codec,
    });
    pipelineTrace('output completed successfully', { storagePath }, trace);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pipelineTraceWarn('output failed', { error: message, storagePath }, trace);
    await ctx.db.markAssetFailed(ctx.trackDbId, output, message);
    if (output.type === 'stream' && output.variant === '128k') {
      ctx.primaryStreamFailed = true;
      ctx.primaryStreamError = message;
    }
    throw err;
  }
}

async function processWaveformOutput(
  ctx: PipelineContext,
  output: PipelineOutputDefinition,
  masterFileName: string,
  trace: PipelineTraceContext
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

  pipelineTrace('generate-waveform markAssetProcessing', { storagePath, localOut }, trace);
  await ctx.db.markAssetProcessing(ctx.trackDbId, output);

  try {
    pipelineTrace('generate-waveform running ffmpeg pcm', { input: ctx.masterLocalPath }, trace);
    const peaksResult = await generateWaveformPeaksJsonFile(ctx.masterLocalPath, localOut);

    pipelineTrace(
      'generate-waveform uploading to storage',
      { storagePath, contentType: contentTypeForExtension(output.extension) },
      trace
    );
    await ctx.storage.uploadFile(storagePath, localOut, contentTypeForExtension(output.extension));

    const generatorVersion = GENERATOR_VERSIONS[output.generator] ?? 1;
    const metadata = {
      pointCount: peaksResult.pointCount,
      sampleCount: peaksResult.sampleCount,
    };

    ctx.completedAssets.push({
      ...output,
      storagePath,
      generatorVersion,
      metadata,
    });

    pipelineTrace('generate-waveform markAssetReady', { storagePath, generatorVersion }, trace);
    await ctx.db.markAssetReady(ctx.trackDbId, output, storagePath, generatorVersion, metadata);
    pipelineTrace('generate-waveform output completed', { storagePath }, trace);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    pipelineTraceWarn(
      'generate-waveform output failed (non-fatal)',
      { error: message, storagePath },
      trace
    );
    await ctx.db.markAssetFailed(ctx.trackDbId, output, message);
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
