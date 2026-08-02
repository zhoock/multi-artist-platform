import { selectAssetPath } from '../assetResolver';
import type { TrackAssetRecord } from '../assetResolver';

const ready128: TrackAssetRecord = {
  type: 'stream',
  format: 'opus',
  variant: '128k',
  status: 'ready',
  path: 'users/u/audio/album/derived/stream/opus_128k/track.opus',
};

const readyWaveform: TrackAssetRecord = {
  type: 'waveform',
  format: 'json',
  variant: 'default',
  status: 'ready',
  path: 'users/u/audio/album/derived/waveform/json_default/track.json',
};

const failedWaveform: TrackAssetRecord = {
  type: 'waveform',
  format: 'json',
  variant: 'default',
  status: 'failed',
  path: null,
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
    });
    expect(result.url).toBe(ready128.path);
    expect(result.asset).toEqual({ type: 'stream', format: 'opus', variant: '128k' });
  });

  it('picks opus 256k for premium when both ready', () => {
    const result = selectAssetPath([ready128, ready256], {
      purpose: 'playback',
      processingStatus: 'ready',
      hasPremiumAccess: true,
    });
    expect(result.url).toBe(ready256.path);
    expect(result.asset?.variant).toBe('256k');
  });

  it('returns null when no ready stream', () => {
    const result = selectAssetPath([{ ...ready128, status: 'processing', path: null }], {
      purpose: 'playback',
      processingStatus: 'processing',
      hasPremiumAccess: false,
    });
    expect(result.url).toBeNull();
  });

  it('returns null when track is not ready even if asset is ready', () => {
    const result = selectAssetPath([ready128], {
      purpose: 'playback',
      processingStatus: 'processing',
      hasPremiumAccess: false,
    });
    expect(result.url).toBeNull();
    expect(result.asset).toBeNull();
  });

  it('returns asset when both track and asset are ready', () => {
    const result = selectAssetPath([ready128], {
      purpose: 'playback',
      processingStatus: 'ready',
      hasPremiumAccess: false,
    });
    expect(result.url).toBe(ready128.path);
  });

  it('returns playback URL when stream ready and waveform failed', () => {
    const result = selectAssetPath([ready128, failedWaveform], {
      purpose: 'playback',
      processingStatus: 'ready',
      hasPremiumAccess: false,
    });
    expect(result.url).toBe(ready128.path);
  });

  it('returns waveform URL when track ready and waveform asset ready', () => {
    const result = selectAssetPath([ready128, readyWaveform], {
      purpose: 'waveform',
      processingStatus: 'ready',
      hasPremiumAccess: false,
    });
    expect(result.url).toBe(readyWaveform.path);
    expect(result.asset).toEqual({ type: 'waveform', format: 'json', variant: 'default' });
  });

  it('returns null waveform URL when waveform pending but track ready', () => {
    const result = selectAssetPath(
      [ready128, { ...readyWaveform, status: 'pending', path: null }],
      {
        purpose: 'waveform',
        processingStatus: 'ready',
        hasPremiumAccess: false,
      }
    );
    expect(result.url).toBeNull();
  });

  it('returns null waveform URL when track not playback-ready', () => {
    const result = selectAssetPath([ready128, readyWaveform], {
      purpose: 'waveform',
      processingStatus: 'processing',
      hasPremiumAccess: false,
    });
    expect(result.url).toBeNull();
  });
});
