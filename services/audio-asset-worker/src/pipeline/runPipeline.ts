import { PIPELINE_STAGES } from '../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import { extractMetadataStage } from './stages/extractMetadata.js';
import {
  generateAudioAssetsStage,
  generatePreviewStage,
  generateWaveformStage,
} from './stages/generateAudioAssets.js';
import {
  pipelineTrace,
  pipelineTraceWarn,
  type PipelineTraceContext,
} from '../lib/pipelineTrace.js';
import type { PipelineContext, PipelineStage } from './types.js';

const STAGE_REGISTRY: Record<string, PipelineStage> = {
  'extract-metadata': extractMetadataStage,
  'generate-audio-streams': generateAudioAssetsStage,
  'generate-waveform': generateWaveformStage,
  'generate-preview': generatePreviewStage,
};

export async function runPipeline(
  ctx: PipelineContext,
  stageIds?: string[]
): Promise<PipelineContext> {
  const enabledIds = stageIds ?? PIPELINE_STAGES.filter((s) => s.enabled).map((s) => s.stageId);
  const trace: PipelineTraceContext = {
    trackDbId: ctx.trackDbId,
    trackId: ctx.trackId,
  };

  pipelineTrace(
    'runPipeline start',
    {
      requestedStages: stageIds ?? '(default enabled)',
      enabledStageIds: enabledIds,
    },
    trace
  );

  let current = ctx;
  for (const stageId of enabledIds) {
    const stage = STAGE_REGISTRY[stageId];
    if (!stage) {
      pipelineTraceWarn('runPipeline unknown stage — skipping', { stageId }, trace);
      continue;
    }
    const stageDef = PIPELINE_STAGES.find((s) => s.stageId === stageId);
    if (stageDef && !stageDef.enabled) {
      pipelineTrace('runPipeline stage disabled — skipping', { stageId }, trace);
      continue;
    }

    pipelineTrace(
      'runPipeline running stage',
      { stageId, outputCount: stageDef?.outputs.length ?? 0 },
      trace
    );
    current = await stage.run(current);
    pipelineTrace('runPipeline stage completed', { stageId }, trace);
  }

  pipelineTrace('runPipeline finished', { completedAssets: current.completedAssets.length }, trace);
  return current;
}
