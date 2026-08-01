import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { clearWaveformPeaksCache } from '@shared/lib/audio/loadWaveformPeaks';
import Waveform from '../ui/Waveform';

jest.mock('@shared/lib/audio/loadWaveformPeaks', () => ({
  ...jest.requireActual('@shared/lib/audio/loadWaveformPeaks'),
  loadWaveformPeaks: jest.fn(),
}));

import { loadWaveformPeaks } from '@shared/lib/audio/loadWaveformPeaks';

const mockLoadWaveformPeaks = loadWaveformPeaks as jest.MockedFunction<typeof loadWaveformPeaks>;

describe('Waveform', () => {
  beforeEach(() => {
    clearWaveformPeaksCache();
    mockLoadWaveformPeaks.mockReset();
  });

  test('shows skeleton when waveformUrl is missing', () => {
    render(<Waveform waveformUrl={null} height={64} />);
    expect(screen.getByRole('img', { name: 'Waveform loading' })).toBeInTheDocument();
    expect(mockLoadWaveformPeaks).not.toHaveBeenCalled();
  });

  test('loads peaks from waveformUrl and renders canvas', async () => {
    const peaks = [0.2, 0.8, 0.5];
    mockLoadWaveformPeaks.mockResolvedValue(peaks);

    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      clearRect: jest.fn(),
      fillRect: jest.fn(),
      fillStyle: '',
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 300,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 64,
    });

    const { container } = render(
      <Waveform waveformUrl="https://cdn.example/waveform.json" height={64} />
    );

    await waitFor(() => {
      expect(container.querySelector('canvas')).toBeTruthy();
    });

    expect(mockLoadWaveformPeaks).toHaveBeenCalledWith('https://cdn.example/waveform.json');
    expect(screen.queryByRole('img', { name: 'Waveform loading' })).not.toBeInTheDocument();
  });

  test('shows skeleton when peaks load fails', async () => {
    mockLoadWaveformPeaks.mockRejectedValue(new Error('network'));

    render(<Waveform waveformUrl="https://cdn.example/missing.json" height={64} />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Waveform loading' })).toBeInTheDocument();
    });
  });

  test('does not use audio decode APIs', () => {
    const source = readFileSync(join(__dirname, '../ui/Waveform.tsx'), 'utf8');
    expect(source).not.toMatch(/decodeAudioData/);
    expect(source).not.toMatch(/AudioContext/);
    expect(source).not.toMatch(/arrayBuffer\(\)/);
  });
});
