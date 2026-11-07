import { logStemLoadDiagnostic, redactStemUrlForLog } from './stemLoadDiagnostics';

/** LRU cap: stored compressed bytes (MP3), not decoded PCM. */
const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

type CacheEntry = {
  bytes: ArrayBuffer;
  byteLength: number;
  cachedAt: number;
  lastAccess: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ArrayBuffer>>();

let maxBytes = DEFAULT_MAX_BYTES;
let totalCachedBytes = 0;

export type StemAudioCacheStats = {
  entries: number;
  totalCachedBytes: number;
  maxBytes: number;
  inflight: number;
};

export function getStemAudioCacheStats(): StemAudioCacheStats {
  return {
    entries: cache.size,
    totalCachedBytes,
    maxBytes,
    inflight: inflight.size,
  };
}

/** Test / manual reset helper. */
/** Dev console: `__stemAudioCache.clear()` / `.stats()` after import side-effect in dev builds. */
export function clearStemAudioCache(): void {
  resetStemAudioCacheForTests();
}

export function resetStemAudioCacheForTests(options?: { maxBytes?: number }): void {
  cache.clear();
  inflight.clear();
  totalCachedBytes = 0;
  if (options?.maxBytes != null) {
    maxBytes = options.maxBytes;
  } else {
    maxBytes = DEFAULT_MAX_BYTES;
  }
}

function touchEntry(key: string, entry: CacheEntry): void {
  entry.lastAccess = Date.now();
  cache.delete(key);
  cache.set(key, entry);
}

function evictOneLru(): void {
  const oldestKey = cache.keys().next().value as string | undefined;
  if (!oldestKey) return;
  const entry = cache.get(oldestKey);
  if (!entry) return;
  cache.delete(oldestKey);
  totalCachedBytes -= entry.byteLength;
  logStemLoadDiagnostic('STEM_CACHE_EVICT', {
    reason: `lru key=${oldestKey} bytes=${entry.byteLength}`,
  });
}

function storeInCache(assetKey: string, bytes: ArrayBuffer): void {
  const byteLength = bytes.byteLength;
  if (byteLength <= 0) return;

  const existing = cache.get(assetKey);
  if (existing) {
    totalCachedBytes -= existing.byteLength;
    cache.delete(assetKey);
  }

  while (totalCachedBytes + byteLength > maxBytes && cache.size > 0) {
    evictOneLru();
  }

  if (totalCachedBytes + byteLength > maxBytes) {
    return;
  }

  const entry: CacheEntry = {
    bytes,
    byteLength,
    cachedAt: Date.now(),
    lastAccess: Date.now(),
  };
  cache.set(assetKey, entry);
  totalCachedBytes += byteLength;
}

async function fetchStemBytes(
  assetKey: string,
  url: string,
  fetchOptions?: RequestInit
): Promise<ArrayBuffer> {
  logStemLoadDiagnostic('STEM_CACHE_MISS', {
    reason: assetKey,
  });
  logStemLoadDiagnostic('STEM_FETCH_START', {
    reason: assetKey,
    urlForLog: redactStemUrlForLog(url),
  });

  const resp = await fetch(url, { cache: 'force-cache', ...fetchOptions });
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    logStemLoadDiagnostic('STEM_FETCH_ERROR', {
      reason: assetKey,
      urlForLog: redactStemUrlForLog(url),
    });
    throw err;
  }

  const buf = await resp.arrayBuffer();
  if (buf.byteLength === 0) {
    const err = new Error('Empty stem buffer');
    logStemLoadDiagnostic('STEM_FETCH_ERROR', { reason: assetKey });
    throw err;
  }

  storeInCache(assetKey, buf);
  logStemLoadDiagnostic('STEM_FETCH_DONE', {
    reason: `${assetKey} bytes=${buf.byteLength}`,
    urlForLog: redactStemUrlForLog(url),
  });
  return buf;
}

/**
 * Returns stem bytes (shared cache + in-flight dedup). Failed fetches are not cached.
 */
export async function getStemAudioBytes(
  assetKey: string,
  url: string,
  fetchOptions?: RequestInit
): Promise<ArrayBuffer> {
  if (!assetKey.trim()) {
    throw new Error('Stem assetKey is required');
  }

  const hit = cache.get(assetKey);
  if (hit) {
    touchEntry(assetKey, hit);
    logStemLoadDiagnostic('STEM_CACHE_HIT', { reason: assetKey });
    return hit.bytes.slice(0);
  }

  const pending = inflight.get(assetKey);
  if (pending) {
    logStemLoadDiagnostic('STEM_INFLIGHT_DEDUP', { reason: assetKey });
    return pending.then((buf) => buf.slice(0));
  }

  const work = fetchStemBytes(assetKey, url, fetchOptions).finally(() => {
    inflight.delete(assetKey);
  });
  inflight.set(assetKey, work);
  return work.then((buf) => buf.slice(0));
}

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (
    window as unknown as {
      __stemAudioCache?: { clear: () => void; stats: () => StemAudioCacheStats };
    }
  ).__stemAudioCache = {
    clear: clearStemAudioCache,
    stats: getStemAudioCacheStats,
  };
}
