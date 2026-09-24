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
      getCurrentTime: () => 0,
      getDuration: () => 60,
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
};

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
    playMock.mockResolvedValue(undefined);
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
