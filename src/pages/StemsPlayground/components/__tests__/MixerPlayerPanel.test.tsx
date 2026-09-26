import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StemEnginePlayError } from '@audio/stemsEngine';
import type { MixerPlayerPanelLabels } from '../MixerPlayerPanel';
import { MixerPlayerPanel } from '../MixerPlayerPanel';
import type { MixerTrack } from '../../lib/types';

jest.mock('@shared/ui/waveform', () => ({
  Waveform: () => <div data-testid="waveform" />,
}));

jest.mock('@shared/lib/auth', () => ({
  getAuthHeader: () => ({}),
}));

const loadAllMock =
  jest.fn<
    (
      progress?: (p: number) => void
    ) => Promise<{ loadedStemIds: string[]; failedStemIds: string[] }>
  >();
const playMock = jest.fn<(from?: number) => Promise<void>>();
const disposeMock = jest.fn();
const seekMock = jest.fn<(time: number) => Promise<void>>();
let mockCurrentTime = 0;
const mockDuration = 60;

jest.mock('@audio/stemsEngine', () => {
  const actual = jest.requireActual<typeof import('@audio/stemsEngine')>('@audio/stemsEngine');

  return {
    ...actual,
    StemEngine: jest.fn().mockImplementation(() => ({
      loadAll: (progress?: (p: number) => void) => loadAllMock(progress),
      play: (from?: number) => playMock(from),
      pause: jest.fn(async () => {}),
      dispose: disposeMock,
      hasPlayableNodes: jest.fn(() => true),
      getCurrentTime: () => mockCurrentTime,
      getDuration: () => mockDuration,
      seek: (time: number) => seekMock(time),
      isPlaying: false,
      setVolume: jest.fn(),
      setMuted: jest.fn(),
      setSolo: jest.fn(),
    })),
  };
});

const labels: MixerPlayerPanelLabels = {
  play: 'Play',
  pause: 'Pause',
  solo: 'Solo',
  mute: 'Mute',
  stemsLoadError: 'Could not load stems',
  retry: 'Retry',
  stemLoadFailed: 'Unavailable',
  playBlocked: 'Tap Play again to start audio',
  partialStemsFailed: 'Some stems could not be loaded',
  trackPosition: 'Track position',
};

const labelsRu: MixerPlayerPanelLabels = {
  ...labels,
  trackPosition: 'Позиция трека',
};

async function waitForReadySeekSlider(name: string | RegExp = 'Track position') {
  await waitFor(() => {
    expect(screen.getByRole('slider', { name })).toBeInTheDocument();
  });
  return screen.getByRole('slider', { name }) as HTMLInputElement;
}

function dispatchWavePointer(
  track: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX,
    clientY: 32,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
  });
  fireEvent(track, event);
}

const baseTrack: MixerTrack = {
  id: 'track-1',
  title: 'Test track',
  duration: 120,
  stems: [
    { id: 'stem-a', name: 'Vocals', category: 'vocal', url: 'https://example.com/a.wav' },
    { id: 'stem-b', name: 'Drums', category: 'drums', url: 'https://example.com/b.wav' },
  ],
};

describe('MixerPlayerPanel error handling', () => {
  beforeEach(() => {
    loadAllMock.mockReset();
    playMock.mockReset();
    disposeMock.mockReset();
    seekMock.mockReset();
    mockCurrentTime = 0;
    playMock.mockResolvedValue(undefined);
    seekMock.mockImplementation(async (time: number) => {
      mockCurrentTime = time;
    });
  });

  test('total load failure shows error UI, Retry, and disabled Play', async () => {
    loadAllMock.mockRejectedValue(new Error('all failed'));

    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load stems');
    });

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Play' })[0]).toBeDisabled();
  });

  test('Retry triggers a new load attempt after total failure', async () => {
    loadAllMock
      .mockRejectedValueOnce(new Error('all failed'))
      .mockResolvedValueOnce({ loadedStemIds: ['stem-a', 'stem-b'], failedStemIds: [] });

    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load stems');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByTestId('waveform')).toBeInTheDocument();
    });

    expect(loadAllMock).toHaveBeenCalledTimes(2);
  });

  test('partial failure keeps Play enabled and marks failed stem row', async () => {
    loadAllMock.mockResolvedValue({
      loadedStemIds: ['stem-a'],
      failedStemIds: ['stem-b'],
    });

    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);

    await waitFor(() => {
      expect(screen.getByText('Some stems could not be loaded')).toBeInTheDocument();
    });

    expect(screen.getAllByRole('button', { name: 'Play' })[0]).not.toBeDisabled();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  });

  test('play rejection does not leave UI in playing state', async () => {
    loadAllMock.mockResolvedValue({
      loadedStemIds: ['stem-a', 'stem-b'],
      failedStemIds: [],
    });

    playMock.mockRejectedValueOnce(new StemEnginePlayError('blocked', 'AUDIO_CONTEXT_BLOCKED'));

    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Play' })[0]).not.toBeDisabled();
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Play' })[0]);

    await waitFor(() => {
      expect(screen.getByText('Tap Play again to start audio')).toBeInTheDocument();
    });

    expect(screen.getAllByRole('button', { name: 'Play' })[0]).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});

describe('MixerPlayerPanel seek accessibility', () => {
  beforeEach(() => {
    loadAllMock.mockReset();
    playMock.mockReset();
    disposeMock.mockReset();
    seekMock.mockReset();
    mockCurrentTime = 0;
    playMock.mockResolvedValue(undefined);
    seekMock.mockImplementation(async (time: number) => {
      mockCurrentTime = time;
    });
    loadAllMock.mockResolvedValue({
      loadedStemIds: ['stem-a', 'stem-b'],
      failedStemIds: [],
    });
  });

  test('exposes localized EN seek slider with min/max/value', async () => {
    mockCurrentTime = 15;
    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);
    const slider = await waitForReadySeekSlider('Track position');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('100');
    await waitFor(() => {
      expect(slider.value).toBe('25');
    });
  });

  test('exposes localized RU accessible name', async () => {
    render(<MixerPlayerPanel track={baseTrack} labels={labelsRu} />);
    await waitForReadySeekSlider('Позиция трека');
  });

  test('ArrowRight and ArrowLeft call engine.seek', async () => {
    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);
    const slider = await waitForReadySeekSlider();
    slider.focus();

    // jsdom does not apply native range key stepping; fire input/change as the browser would after ArrowRight.
    fireEvent.keyDown(slider, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.input(slider, { target: { value: '1' } });
    fireEvent.change(slider, { target: { value: '1' } });
    expect(seekMock).toHaveBeenCalledWith(0.6);

    fireEvent.keyDown(slider, { key: 'ArrowLeft', code: 'ArrowLeft' });
    fireEvent.input(slider, { target: { value: '0' } });
    fireEvent.change(slider, { target: { value: '0' } });
    expect(seekMock).toHaveBeenCalledWith(0);
  });

  test('Home and End seek to start and end', async () => {
    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);
    const slider = await waitForReadySeekSlider();
    slider.focus();

    fireEvent.keyDown(slider, { key: 'End', code: 'End' });
    fireEvent.input(slider, { target: { value: '100' } });
    fireEvent.change(slider, { target: { value: '100' } });
    expect(seekMock).toHaveBeenCalledWith(mockDuration);

    fireEvent.keyDown(slider, { key: 'Home', code: 'Home' });
    fireEvent.input(slider, { target: { value: '0' } });
    fireEvent.change(slider, { target: { value: '0' } });
    expect(seekMock).toHaveBeenCalledWith(0);
  });

  test('pointer seek on wave track still updates position', async () => {
    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);
    await waitForReadySeekSlider();
    const track = document.querySelector('.stems__wave-track') as HTMLElement;
    expect(track).toBeTruthy();
    track.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 100,
        width: 100,
        top: 0,
        bottom: 64,
        height: 64,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    track.setPointerCapture = jest.fn();
    track.releasePointerCapture = jest.fn();

    dispatchWavePointer(track, 'pointerdown', 50);
    expect(seekMock).toHaveBeenCalledWith(30);
    dispatchWavePointer(track, 'pointermove', 75);
    expect(seekMock).toHaveBeenCalledWith(45);
    dispatchWavePointer(track, 'pointerup', 75);
  });

  test('seek slider absent while loading and disabled until ready', async () => {
    loadAllMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ loadedStemIds: ['stem-a', 'stem-b'], failedStemIds: [] }),
            100
          );
        })
    );
    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);
    expect(screen.queryByRole('slider', { name: 'Track position' })).not.toBeInTheDocument();
    await waitForReadySeekSlider();
  });

  test('total load error hides seek until Retry succeeds', async () => {
    loadAllMock
      .mockRejectedValueOnce(new Error('all failed'))
      .mockResolvedValueOnce({ loadedStemIds: ['stem-a', 'stem-b'], failedStemIds: [] });

    render(<MixerPlayerPanel track={baseTrack} labels={labels} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load stems');
    });
    expect(screen.queryByRole('slider', { name: 'Track position' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitForReadySeekSlider();
  });
});
