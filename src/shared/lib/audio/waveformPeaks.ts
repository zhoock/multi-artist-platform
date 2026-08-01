/**
 * Server-generated waveform peaks JSON contract (v1).
 * Shared between audio-asset-worker and future client Waveform (C3).
 */

export const WAVEFORM_PEAKS_VERSION = 1 as const;
export const DEFAULT_WAVEFORM_POINT_COUNT = 900;

export type WaveformPeaks = {
  version: typeof WAVEFORM_PEAKS_VERSION;
  pointCount: number;
  peaks: number[];
};

/** Downsample mono PCM samples into normalized peaks (0..1). Server-side generation uses this algorithm. */
export function computePeaksFromSamples(
  samples: Float32Array | ArrayLike<number>,
  pointCount: number = DEFAULT_WAVEFORM_POINT_COUNT
): number[] {
  const count = Math.max(1, Math.floor(pointCount));
  const length = samples.length;
  if (length === 0) {
    return new Array(count).fill(0);
  }

  const block = Math.max(1, Math.floor(length / count));
  const peaks = new Array<number>(count).fill(0);

  for (let i = 0; i < count; i++) {
    let sum = 0;
    const start = i * block;
    const end = Math.min(start + block, length);
    for (let j = start; j < end; j++) sum += Math.abs(Number(samples[j]));
    peaks[i] = sum / (end - start);
  }

  const max = Math.max(...peaks) || 1;
  return peaks.map((v) => v / max);
}

export function validateWaveformPeaksJson(raw: unknown): WaveformPeaks | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.version !== WAVEFORM_PEAKS_VERSION) return null;
  if (typeof record.pointCount !== 'number' || !Number.isFinite(record.pointCount)) return null;
  if (!Array.isArray(record.peaks)) return null;

  const pointCount = Math.floor(record.pointCount);
  if (pointCount < 1) return null;
  if (record.peaks.length !== pointCount) return null;

  const peaks: number[] = [];
  for (const value of record.peaks) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      return null;
    }
    peaks.push(value);
  }

  return { version: WAVEFORM_PEAKS_VERSION, pointCount, peaks };
}

export function serializeWaveformPeaks(peaks: number[], pointCount: number = peaks.length): string {
  const payload: WaveformPeaks = {
    version: WAVEFORM_PEAKS_VERSION,
    pointCount,
    peaks,
  };
  return JSON.stringify(payload);
}

export function buildWaveformPeaksFromSamples(
  samples: Float32Array | ArrayLike<number>,
  pointCount: number = DEFAULT_WAVEFORM_POINT_COUNT
): WaveformPeaks {
  const peaks = computePeaksFromSamples(samples, pointCount);
  return {
    version: WAVEFORM_PEAKS_VERSION,
    pointCount: peaks.length,
    peaks,
  };
}
