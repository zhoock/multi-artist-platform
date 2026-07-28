import { selectAssetPath } from '../assetResolver';
import type { TrackAssetRecord } from '../assetResolver';

const ready128: TrackAssetRecord = {
  type: 'stream',
  format: 'opus',
  variant: '128k',
  status: 'ready',
  path: 'users/u/audio/album/derived/stream/opus_128k/track.opus',
};

const ready256: TrackAssetRecord = {
  type: 'stream',
  format: 'opus',
  variant: '256k',
  status: 'ready',
  path: 'users/u/audio/album/derived/stream/opus_256k/track.opus',
};

describe('selectAssetPath', () => {
  it('picks opus 128k for free user when ready', () => {
    const result = selectAssetPath([ready128], {
      purpose: 'playback',
      processingStatus: 'ready',
      hasPremiumAccess: false,
      pipelineAvailable: true,
    });
    expect(result.url).toBe(ready128.path);
    expect(result.asset).toEqual({ type: 'stream', format: 'opus', variant: '128k' });
  });

  it('picks opus 256k for premium when both ready', () => {
    const result = selectAssetPath([ready128, ready256], {
      purpose: 'playback',
      processingStatus: 'ready',
      hasPremiumAccess: true,
      pipelineAvailable: true,
    });
    expect(result.url).toBe(ready256.path);
    expect(result.asset?.variant).toBe('256k');
  });

  it('returns null when no ready stream', () => {
    const result = selectAssetPath([{ ...ready128, status: 'processing', path: null }], {
      purpose: 'playback',
      processingStatus: 'processing',
      hasPremiumAccess: false,
      pipelineAvailable: true,
    });
    expect(result.url).toBeNull();
  });

  it('returns null when track is not ready even if asset is ready', () => {
    const result = selectAssetPath([ready128], {
      purpose: 'playback',
      processingStatus: 'processing',
      hasPremiumAccess: false,
      pipelineAvailable: true,
    });
    expect(result.url).toBeNull();
    expect(result.asset).toBeNull();
  });

  it('returns asset when both track and asset are ready', () => {
    const result = selectAssetPath([ready128], {
      purpose: 'playback',
      processingStatus: 'ready',
      hasPremiumAccess: false,
      pipelineAvailable: true,
    });
    expect(result.url).toBe(ready128.path);
  });

  it('falls back to legacy src when pipeline unavailable', () => {
    const result = selectAssetPath([], {
      purpose: 'playback',
      processingStatus: 'ready',
      hasPremiumAccess: false,
      pipelineAvailable: false,
      legacySrc: 'https://example.com/legacy.mp3',
    });
    expect(result.url).toBe('https://example.com/legacy.mp3');
  });
});
