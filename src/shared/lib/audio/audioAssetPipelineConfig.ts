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
        ffmpegArgs: ['-c:a', 'libopus', '-b:a', '128k', '-vbr', 'on', '-application', 'audio'],
      },
    ],
  },
  {
    stageId: 'generate-waveform',
    enabled: false,
    outputs: [],
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
