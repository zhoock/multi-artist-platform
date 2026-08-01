import { clearWaveformPeaksCache, loadWaveformPeaks } from '../loadWaveformPeaks';
import { serializeWaveformPeaks, buildWaveformPeaksFromSamples } from '../waveformPeaks';

describe('loadWaveformPeaks', () => {
  beforeEach(() => {
    clearWaveformPeaksCache();
    jest.restoreAllMocks();
  });

  test('fetches and validates peaks JSON', async () => {
    const payload = buildWaveformPeaksFromSamples(new Float32Array([0, 0.5, -1, 0.2]), 4);
    const url = 'https://cdn.example/waveform.json';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => JSON.parse(serializeWaveformPeaks(payload.peaks, payload.pointCount)),
    }) as jest.Mock;

    const peaks = await loadWaveformPeaks(url);
    expect(peaks).toEqual(payload.peaks);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('returns cached peaks for the same URL', async () => {
    const url = 'https://cdn.example/cached.json';
    const peaks = [0.1, 0.9, 0.3];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => JSON.parse(serializeWaveformPeaks(peaks, peaks.length)),
    }) as jest.Mock;

    await loadWaveformPeaks(url);
    await loadWaveformPeaks(url);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('returns null for empty URL', async () => {
    await expect(loadWaveformPeaks('   ')).resolves.toBeNull();
  });

  test('throws on invalid JSON payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 2, pointCount: 1, peaks: [0.5] }),
    }) as jest.Mock;

    await expect(loadWaveformPeaks('https://cdn.example/bad.json')).rejects.toThrow(
      'Invalid waveform peaks JSON'
    );
  });
});
