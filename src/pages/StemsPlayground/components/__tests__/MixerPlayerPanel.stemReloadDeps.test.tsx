import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { render, waitFor } from '@testing-library/react';
import { MixerPlayerPanel } from '../MixerPlayerPanel';
import type { MixerTrack } from '../../lib/types';
import { StemEngine } from '@audio/stemsEngine';

jest.mock('@shared/ui/waveform', () => ({
  Waveform: () => <div data-testid="waveform" />,
}));

jest.mock('@shared/lib/auth', () => ({
  getAuthHeader: () => ({}),
}));

class FakeAudioContext {
  state = 'running';
  destination = {};
  currentTime = 0;
  createGain() {
    return { gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      disconnect: jest.fn(),
      onended: null,
    };
  }
  decodeAudioData = jest.fn(async () => ({ duration: 10 }));
  resume = jest.fn(async () => {});
  suspend = jest.fn(async () => {});
  close = jest.fn();
}

beforeEach(() => {
  (globalThis as any).AudioContext = FakeAudioContext;
});

const labels = {
  play: 'Play',
  pause: 'Pause',
  solo: 'Solo',
  mute: 'Mute',
  stemsLoadError: 'err',
  retry: 'Retry',
  stemLoadFailed: 'fail',
  playBlocked: 'blocked',
  partialStemsFailed: 'partial',
  trackPosition: 'Seek',
};

const stem = {
  id: 'stem-a',
  name: 'Vocals',
  category: 'vocal' as const,
  url: '/api/stems/audio?artistUserId=a&albumId=b&trackId=c&file=stem-a.mp3&accessToken=t&expiresAt=999',
  assetKey: 'a:b:c:stem-a.mp3',
};

function makeTrack(id: string): MixerTrack {
  return {
    id,
    title: 'Track',
    duration: 60,
    stems: [stem],
  };
}

describe('MixerPlayerPanel stem reload dependencies', () => {
  let loadAllSpy: jest.SpiedFunction<typeof StemEngine.prototype.loadAll>;

  beforeEach(() => {
    loadAllSpy = jest.spyOn(StemEngine.prototype, 'loadAll').mockResolvedValue({
      loadedStemIds: ['stem-a'],
      failedStemIds: [],
    });
  });

  afterEach(() => {
    loadAllSpy.mockRestore();
  });

  test('volume/mute state updates do not re-run stem load effect', async () => {
    const track = makeTrack('t1');
    const { getByRole } = render(<MixerPlayerPanel track={track} labels={labels} />);
    await waitFor(() => expect(loadAllSpy).toHaveBeenCalledTimes(1));

    const muteBtn = getByRole('button', { name: /mute/i });
    muteBtn.click();
    muteBtn.click();

    expect(loadAllSpy).toHaveBeenCalledTimes(1);
  });

  test('new track object with same stem assets does not re-run load effect', async () => {
    const track = makeTrack('t1');
    const { rerender } = render(<MixerPlayerPanel track={track} labels={labels} />);
    await waitFor(() => expect(loadAllSpy).toHaveBeenCalledTimes(1));

    const trackClone: MixerTrack = {
      ...track,
      stems: [
        {
          ...stem,
          url: '/api/stems/audio?artistUserId=a&albumId=b&trackId=c&file=stem-a.mp3&accessToken=new&expiresAt=1000',
        },
      ],
    };
    rerender(<MixerPlayerPanel track={trackClone} labels={labels} />);
    await waitFor(() => expect(loadAllSpy).toHaveBeenCalledTimes(1));
  });
});
