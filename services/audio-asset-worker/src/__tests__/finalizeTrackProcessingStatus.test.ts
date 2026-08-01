import { finalizeTrackProcessingStatus } from '../finalizeTrackProcessingStatus';
import type { PipelineDb } from '../pipeline/types';
import type { PipelineOutputDefinition } from '../../../../src/shared/lib/audio/audioAssetPipelineConfig';

const streamOutput: PipelineOutputDefinition = {
  type: 'stream',
  format: 'opus',
  variant: '128k',
  generator: 'ffmpeg-opus',
  extension: 'opus',
  processor: 'ffmpeg',
  playbackRequired: true,
};

function createMockDb(overrides: Partial<PipelineDb> = {}): PipelineDb {
  const setProcessingStatus = jest.fn().mockResolvedValue(undefined);
  const getPlaybackRequiredAssetStatuses = jest
    .fn()
    .mockResolvedValue([{ output: streamOutput, status: 'ready', error: null }]);

  return {
    setProcessingStatus,
    markAssetProcessing: jest.fn(),
    markAssetReady: jest.fn(),
    markAssetFailed: jest.fn(),
    syncLegacySrc: jest.fn(),
    snapshotTrackAssets: jest.fn().mockResolvedValue(undefined),
    getTrackProcessingStatus: jest.fn().mockResolvedValue('ready'),
    getPlaybackRequiredAssetStatuses,
    countPlaybackRequiredNotReady: jest.fn(),
    anyPlaybackRequiredFailed: jest.fn(),
    countNotReadyAssets: jest.fn(),
    ...overrides,
  };
}

describe('finalizeTrackProcessingStatus', () => {
  const trace = { trackDbId: 'track-1', trackId: 't1' };

  it('marks track ready when playback-required assets are ready (waveform pending ignored)', async () => {
    const db = createMockDb({
      getPlaybackRequiredAssetStatuses: jest
        .fn()
        .mockResolvedValue([{ output: streamOutput, status: 'ready', error: null }]),
      countNotReadyAssets: jest.fn().mockResolvedValue(1),
    });

    const result = await finalizeTrackProcessingStatus(db, 'track-1', trace);

    expect(result).toBe('ready');
    expect(db.setProcessingStatus).toHaveBeenCalledWith('track-1', 'ready', null);
  });

  it('marks track failed when playback-required asset failed', async () => {
    const db = createMockDb({
      getPlaybackRequiredAssetStatuses: jest
        .fn()
        .mockResolvedValue([{ output: streamOutput, status: 'failed', error: 'ffmpeg error' }]),
    });

    const result = await finalizeTrackProcessingStatus(db, 'track-1', trace);

    expect(result).toBe('failed');
    expect(db.setProcessingStatus).toHaveBeenCalledWith('track-1', 'failed', 'ffmpeg error');
  });

  it('uses pipelineError when required asset failed and pipeline threw', async () => {
    const db = createMockDb({
      getPlaybackRequiredAssetStatuses: jest
        .fn()
        .mockResolvedValue([{ output: streamOutput, status: 'failed', error: 'row error' }]),
    });

    await finalizeTrackProcessingStatus(db, 'track-1', trace, {
      pipelineError: 'stage threw',
    });

    expect(db.setProcessingStatus).toHaveBeenCalledWith('track-1', 'failed', 'stage threw');
  });

  it('marks track processing when required assets not ready and no pipeline error', async () => {
    const db = createMockDb({
      getPlaybackRequiredAssetStatuses: jest
        .fn()
        .mockResolvedValue([{ output: streamOutput, status: 'processing', error: null }]),
    });

    const result = await finalizeTrackProcessingStatus(db, 'track-1', trace);

    expect(result).toBe('processing');
    expect(db.setProcessingStatus).toHaveBeenCalledWith('track-1', 'processing', null);
  });

  it('marks track failed when pipeline error and required assets not ready', async () => {
    const db = createMockDb({
      getPlaybackRequiredAssetStatuses: jest
        .fn()
        .mockResolvedValue([{ output: streamOutput, status: 'processing', error: null }]),
    });

    const result = await finalizeTrackProcessingStatus(db, 'track-1', trace, {
      pipelineError: 'stream encode failed',
    });

    expect(result).toBe('failed');
    expect(db.setProcessingStatus).toHaveBeenCalledWith(
      'track-1',
      'failed',
      'stream encode failed'
    );
  });
});
