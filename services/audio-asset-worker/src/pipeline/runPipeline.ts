import { PIPELINE_STAGES } from '../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import { extractMetadataStage } from './stages/extractMetadata.js';
import {
  generateAudioAssetsStage,
  generatePreviewStage,
  generateWaveformStage,
} from './stages/generateAudioAssets.js';
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

  let current = ctx;
  for (const stageId of enabledIds) {
    const stage = STAGE_REGISTRY[stageId];
    if (!stage) {
      console.warn('[runPipeline] Unknown stage:', stageId);
      continue;
    }
    const stageDef = PIPELINE_STAGES.find((s) => s.stageId === stageId);
    if (stageDef && !stageDef.enabled) continue;
    current = await stage.run(current);
  }
  return current;
}
