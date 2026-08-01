/**
 * Audio Asset Pipeline configuration — codec-agnostic recipes, generators, resolver policy.
 */

export type AssetType = 'stream' | 'preview' | 'waveform' | 'spectrogram' | 'loudness';
export type AssetFormat = 'opus' | 'aac' | 'mp3' | 'json' | 'webp';
export type AssetVariant = '128k' | '256k' | '96k' | '30s' | 'default' | '192k';

export type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type AssetStatus = ProcessingStatus;

/** Current version per generator — bump independently when that algorithm changes. */
export const GENERATOR_VERSIONS: Record<string, number> = {
  'ffmpeg-opus': 1,
  'ffmpeg-aac': 1,
  waveform: 1,
  loudness: 1,
  preview: 1,
};

export interface PipelineOutputDefinition {
  type: AssetType;
  format: AssetFormat;
  variant: AssetVariant;
  generator: string;
  extension: string;
  processor: 'ffmpeg' | 'custom';
  ffmpegArgs?: string[];
  /**
   * When true, asset must be ready for tracks.processing_status = ready (playback gate).
   * Optional assets (waveform) use false — see docs/architecture/audio-asset-pipeline.md.
   */
  playbackRequired?: boolean;
}

export interface PipelineStageDefinition {
  stageId: string;
  enabled: boolean;
  outputs: PipelineOutputDefinition[];
}

export const PIPELINE_STAGES: PipelineStageDefinition[] = [
  {
    stageId: 'extract-metadata',
    enabled: true,
    outputs: [],
  },
  {
    stageId: 'generate-audio-streams',
    enabled: true,
    outputs: [
      {
        type: 'stream',
        format: 'opus',
        variant: '128k',
        generator: 'ffmpeg-opus',
        extension: 'opus',
        processor: 'ffmpeg',
        playbackRequired: true,
        ffmpegArgs: ['-c:a', 'libopus', '-b:a', '128k', '-vbr', 'on', '-application', 'audio'],
      },
    ],
  },
  {
    stageId: 'generate-waveform',
    enabled: true,
    outputs: [
      {
        type: 'waveform',
        format: 'json',
        variant: 'default',
        generator: 'waveform',
        extension: 'json',
        processor: 'custom',
        playbackRequired: false,
      },
    ],
  },
  {
    stageId: 'generate-preview',
    enabled: false,
    outputs: [],
  },
];

export const ENABLED_PIPELINE_STAGE_IDS = PIPELINE_STAGES.filter((s) => s.enabled).map(
  (s) => s.stageId
);

/** Stage ids that only produce optional (non-playback) assets. */
export const OPTIONAL_ONLY_PIPELINE_STAGE_IDS = PIPELINE_STAGES.filter(
  (stage) =>
    stage.enabled &&
    stage.outputs.length > 0 &&
    stage.outputs.every((output) => !isPlaybackRequiredOutput(output))
).map((stage) => stage.stageId);

export interface AssetResolverPolicyRule {
  type: AssetType;
  format: AssetFormat;
  variant: AssetVariant;
  requiresPremium?: boolean;
  requiresCodec?: string;
  maxBandwidthKbps?: number;
}

/** Asset Resolver policy: ordered candidates; picks first ready match satisfying context. */
export const ASSET_RESOLVER_POLICY: AssetResolverPolicyRule[] = [
  { type: 'stream', format: 'opus', variant: '256k', requiresPremium: true },
  { type: 'stream', format: 'opus', variant: '128k' },
  { type: 'stream', format: 'aac', variant: '192k', requiresCodec: 'aac' },
  { type: 'stream', format: 'opus', variant: '96k', maxBandwidthKbps: 128 },
  { type: 'waveform', format: 'json', variant: 'default' },
];

export function getGeneratorVersion(generator: string): number {
  return GENERATOR_VERSIONS[generator] ?? 1;
}

export function findPipelineOutput(
  type: AssetType,
  format: AssetFormat,
  variant: AssetVariant
): PipelineOutputDefinition | undefined {
  for (const stage of PIPELINE_STAGES) {
    const match = stage.outputs.find(
      (o) => o.type === type && o.format === format && o.variant === variant
    );
    if (match) return match;
  }
  return undefined;
}

export function isPlaybackRequiredOutput(output: PipelineOutputDefinition): boolean {
  return output.playbackRequired !== false;
}

export function isPlaybackRequiredAsset(type: string, format: string, variant: string): boolean {
  const output = findPipelineOutput(
    type as AssetType,
    format as AssetFormat,
    variant as AssetVariant
  );
  if (!output) return true;
  return isPlaybackRequiredOutput(output);
}

export function getPlaybackRequiredOutputs(): PipelineOutputDefinition[] {
  const outputs: PipelineOutputDefinition[] = [];
  for (const stage of PIPELINE_STAGES) {
    if (!stage.enabled) continue;
    for (const output of stage.outputs) {
      if (isPlaybackRequiredOutput(output)) {
        outputs.push(output);
      }
    }
  }
  return outputs;
}

export function getAllPipelineOutputs(): PipelineOutputDefinition[] {
  const outputs: PipelineOutputDefinition[] = [];
  for (const stage of PIPELINE_STAGES) {
    if (!stage.enabled) continue;
    outputs.push(...stage.outputs);
  }
  return outputs;
}

/** True when requested stages only run optional-asset generators (e.g. waveform-only regen). */
export function isOptionalOnlyPipelineRun(stageIds: string[]): boolean {
  if (stageIds.length === 0) return false;
  return stageIds.every((id) => OPTIONAL_ONLY_PIPELINE_STAGE_IDS.includes(id));
}

/** Pipeline stage ids that produce outputs for a generator (e.g. `waveform` → generate-waveform). */
export function getStageIdsForGenerator(generator: string): string[] {
  return PIPELINE_STAGES.filter(
    (stage) => stage.enabled && stage.outputs.some((output) => output.generator === generator)
  ).map((stage) => stage.stageId);
}

/** True when all stages for this generator are optional-only (non-playback). */
export function isOptionalOnlyGenerator(generator: string): boolean {
  const stageIds = getStageIdsForGenerator(generator);
  if (stageIds.length === 0) return false;
  return isOptionalOnlyPipelineRun(stageIds);
}

/** Resolve worker stage list for regenerate-by-generator; undefined = full enabled pipeline. */
export function resolveRegenerateStagesForGenerator(generator?: string): string[] | undefined {
  if (!generator?.trim()) return undefined;
  const stageIds = getStageIdsForGenerator(generator.trim());
  return stageIds.length > 0 ? stageIds : undefined;
}

/** Generators produced by the given pipeline stage ids (for logging / enqueue failure scoping). */
export function getGeneratorsForStageIds(stageIds: string[]): string[] {
  const generators = new Set<string>();
  for (const stageId of stageIds) {
    const stage = PIPELINE_STAGES.find((s) => s.stageId === stageId);
    for (const output of stage?.outputs ?? []) {
      generators.add(output.generator);
    }
  }
  return [...generators];
}
