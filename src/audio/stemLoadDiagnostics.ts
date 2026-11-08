/** Opt-in stem load tracing: `sessionStorage.setItem('stem-load-diag', '1')` then reload. */

const STORAGE_KEY = 'stem-load-diag';

export type StemLoadDiagEvent =
  | 'STEM_PANEL_LOAD_EFFECT'
  | 'STEM_PANEL_LOAD_CLEANUP'
  | 'STEM_ENGINE_CREATED'
  | 'STEM_ENGINE_DISPOSED'
  | 'STEM_CACHE_HIT'
  | 'STEM_CACHE_MISS'
  | 'STEM_CACHE_EVICT'
  | 'STEM_PERSIST_HIT'
  | 'STEM_INFLIGHT_DEDUP'
  | 'STEM_FETCH_START'
  | 'STEM_FETCH_DONE'
  | 'STEM_FETCH_ERROR';

export type StemLoadDiagContext = {
  stemId?: string;
  trackId?: string;
  reason?: string;
  audioElementId?: string;
  urlForLog?: string;
};

export function isStemLoadDiagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Drops secrets: keeps origin + pathname; redacts query except safe id fields. */
export function redactStemUrlForLog(raw: string): string {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://local';
    const url = raw.startsWith('http') ? new URL(raw) : new URL(raw, base);
    if (!url.pathname.includes('/api/stems/audio')) {
      if (url.hostname.includes('supabase')) {
        return `${url.origin}${url.pathname}?…`;
      }
      return `${url.origin}${url.pathname}`;
    }
    const keep = new URLSearchParams();
    for (const key of ['artistUserId', 'albumId', 'trackId', 'file']) {
      const v = url.searchParams.get(key);
      if (v) keep.set(key, v);
    }
    const q = keep.toString();
    return q ? `${url.origin}${url.pathname}?${q}` : `${url.origin}${url.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

let audioElementSeq = 0;

export function nextStemEngineInstanceId(): string {
  audioElementSeq += 1;
  return `stem-engine-${audioElementSeq}`;
}

export function logStemLoadDiagnostic(event: StemLoadDiagEvent, ctx: StemLoadDiagContext): void {
  if (!isStemLoadDiagnosticsEnabled()) return;
  const row = {
    event,
    ts: new Date().toISOString(),
    tMs: Math.round(performance.now()),
    ...ctx,
  };
  console.info('[stem-load-diag]', row);
}
