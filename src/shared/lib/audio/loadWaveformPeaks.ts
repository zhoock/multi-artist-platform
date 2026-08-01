import { validateWaveformPeaksJson } from './waveformPeaks';

const peaksCache = new Map<string, number[]>();
const inflightRequests = new Map<string, Promise<number[] | null>>();

/** Clears in-memory peaks cache (tests / dev only). */
export function clearWaveformPeaksCache(): void {
  peaksCache.clear();
  inflightRequests.clear();
}

/**
 * Fetch and validate server-generated waveform peaks JSON.
 * Results are cached in memory by URL (deduped in-flight).
 */
export async function loadWaveformPeaks(waveformUrl: string): Promise<number[] | null> {
  const url = waveformUrl.trim();
  if (!url) return null;

  const cached = peaksCache.get(url);
  if (cached) return cached;

  let inflight = inflightRequests.get(url);
  if (!inflight) {
    inflight = (async () => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`Waveform peaks fetch failed: ${response.status}`);
      }
      const raw: unknown = await response.json();
      const parsed = validateWaveformPeaksJson(raw);
      if (!parsed) {
        throw new Error('Invalid waveform peaks JSON');
      }
      return parsed.peaks;
    })();
    inflightRequests.set(url, inflight);
  }

  try {
    const peaks = await inflight;
    if (peaks) {
      peaksCache.set(url, peaks);
    }
    return peaks;
  } finally {
    inflightRequests.delete(url);
  }
}
