import {
  buildWaveformPeaksFromSamples,
  computePeaksFromSamples,
  DEFAULT_WAVEFORM_POINT_COUNT,
  serializeWaveformPeaks,
  validateWaveformPeaksJson,
  WAVEFORM_PEAKS_VERSION,
} from '../waveformPeaks';

describe('waveformPeaks', () => {
  test('computePeaksFromSamples normalizes to 0..1', () => {
    const samples = new Float32Array([0, 0.5, -1, 0.25, 0]);
    const peaks = computePeaksFromSamples(samples, 3);
    expect(peaks).toHaveLength(3);
    expect(Math.max(...peaks)).toBeCloseTo(1, 5);
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0);
  });

  test('empty samples yield zero peaks', () => {
    const peaks = computePeaksFromSamples(new Float32Array(0), 5);
    expect(peaks).toEqual([0, 0, 0, 0, 0]);
  });

  test('serialize and validate round-trip', () => {
    const samples = new Float32Array(4410);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i);
    const built = buildWaveformPeaksFromSamples(samples, 10);
    const json = serializeWaveformPeaks(built.peaks, built.pointCount);
    const parsed = validateWaveformPeaksJson(JSON.parse(json));
    expect(parsed).toEqual(built);
  });

  test('validate rejects wrong version and length', () => {
    expect(validateWaveformPeaksJson(null)).toBeNull();
    expect(
      validateWaveformPeaksJson({
        version: 2,
        pointCount: 2,
        peaks: [0.5, 0.5],
      })
    ).toBeNull();
    expect(
      validateWaveformPeaksJson({
        version: WAVEFORM_PEAKS_VERSION,
        pointCount: 2,
        peaks: [0.5],
      })
    ).toBeNull();
  });

  test('default point count matches server waveform contract', () => {
    expect(DEFAULT_WAVEFORM_POINT_COUNT).toBe(900);
  });
});
