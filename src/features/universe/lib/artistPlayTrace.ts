/**
 * Artist Play diagnostics — enable with localStorage ARTIST_PLAY_TRACE=1 (reload after set).
 * Report: window.__artistPlayTraceReport()
 */

export type ArtistPlayTraceMark = {
  label: string;
  t: number;
  sinceStartMs: number;
  sincePrevMs: number;
  detail?: Record<string, unknown>;
};

const TRACE_KEY = 'ARTIST_PLAY_TRACE';

let originMs = 0;
let lastMs = 0;
let sessionId = '';
const marks: ArtistPlayTraceMark[] = [];

export function isArtistPlayTraceEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TRACE_KEY) === '1';
  } catch {
    return false;
  }
}

export function artistPlayTraceStart(session: string): void {
  if (!isArtistPlayTraceEnabled()) return;
  originMs = performance.now();
  lastMs = originMs;
  sessionId = session;
  marks.length = 0;
  artistPlayTrace('session.start', { session });
}

export function artistPlayTrace(label: string, detail?: Record<string, unknown>): void {
  if (!isArtistPlayTraceEnabled()) return;
  const t = performance.now();
  const entry: ArtistPlayTraceMark = {
    label,
    t,
    sinceStartMs: Math.round(t - originMs),
    sincePrevMs: Math.round(t - lastMs),
    detail,
  };
  lastMs = t;
  marks.push(entry);

  console.info(
    `[artist-play +${entry.sinceStartMs}ms Δ${entry.sincePrevMs}ms] ${label}`,
    detail ?? ''
  );
}

export function artistPlayTraceReport(): {
  sessionId: string;
  marks: ArtistPlayTraceMark[];
  clickToLastMs: number;
  clickToFirstAudibleMs: number | null;
} {
  const playing = marks.find((m) => m.label === 'audio.playing');
  const clickToLastMs = marks.length ? marks[marks.length - 1].sinceStartMs : 0;
  return {
    sessionId,
    marks: [...marks],
    clickToLastMs,
    clickToFirstAudibleMs: playing?.sinceStartMs ?? null,
  };
}

/** Always bind report on window (works after reload with ARTIST_PLAY_TRACE=1). */
export function ensureArtistPlayTraceGlobalApi(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    __artistPlayTraceReport?: () => ReturnType<typeof artistPlayTraceReport> & {
      enabled?: boolean;
      hint?: string;
    };
  };
  w.__artistPlayTraceReport = () => {
    if (!isArtistPlayTraceEnabled()) {
      return {
        enabled: false,
        hint: 'localStorage.setItem("ARTIST_PLAY_TRACE","1"); location.reload(); then Play artist',
        sessionId: '',
        marks: [],
        clickToLastMs: 0,
        clickToFirstAudibleMs: null,
      };
    }
    return { enabled: true, ...artistPlayTraceReport() };
  };
}

export function installArtistPlayTraceReport(): void {
  ensureArtistPlayTraceGlobalApi();
}

if (typeof window !== 'undefined') {
  ensureArtistPlayTraceGlobalApi();
}
