import type { PipelineOutputDefinition } from '../../../../src/shared/lib/audio/audioAssetPipelineConfig.js';
import type { FfprobeResult } from '../processors/ffmpegTranscoder.js';

export interface CompletedAsset extends PipelineOutputDefinition {
  storagePath: string;
  generatorVersion: number;
  metadata: Record<string, unknown>;
}

export interface PipelineContext {
  userId: string;
  albumDbId: string;
  albumSlug: string;
  trackDbId: string;
  trackId: string;
  masterPath: string;
  masterLocalPath: string;
  workDir: string;
  masterProbe?: FfprobeResult;
  completedAssets: CompletedAsset[];
  primaryStreamFailed?: boolean;
  primaryStreamError?: string;
  db: PipelineDb;
  storage: PipelineStorage;
}

export interface PipelineDb {
  setProcessingStatus(trackDbId: string, status: string, error?: string | null): Promise<void>;
  markAssetProcessing(trackDbId: string, output: PipelineOutputDefinition): Promise<void>;
  markAssetReady(
    trackDbId: string,
    output: PipelineOutputDefinition,
    path: string,
    generatorVersion: number,
    metadata: Record<string, unknown>
  ): Promise<void>;
  markAssetFailed(
    trackDbId: string,
    output: PipelineOutputDefinition,
    error: string
  ): Promise<void>;
  syncLegacySrc(trackDbId: string, publicUrl: string): Promise<void>;
  snapshotTrackAssets(trackDbId: string): Promise<void>;
  getTrackProcessingStatus(trackDbId: string): Promise<string>;
  getPlaybackRequiredAssetStatuses(trackDbId: string): Promise<
    Array<{
      output: PipelineOutputDefinition;
      status: string;
      error: string | null;
    }>
  >;
  countPlaybackRequiredNotReady(trackDbId: string): Promise<number>;
  anyPlaybackRequiredFailed(
    trackDbId: string
  ): Promise<{ output: PipelineOutputDefinition; status: string; error: string | null } | null>;
  countNotReadyAssets(trackDbId: string): Promise<number>;
}

export interface PipelineStorage {
  downloadToFile(storagePath: string, localPath: string): Promise<void>;
  uploadFile(storagePath: string, localPath: string, contentType: string): Promise<void>;
}

export interface PipelineStage {
  stageId: string;
  run(ctx: PipelineContext): Promise<PipelineContext>;
}

export interface ProcessTrackJobPayload {
  userId: string;
  albumDbId: string;
  albumSlug: string;
  trackDbId: string;
  trackId: string;
  masterPath: string;
  stages?: string[];
}
