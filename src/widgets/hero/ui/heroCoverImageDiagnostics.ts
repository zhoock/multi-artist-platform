const STORAGE_KEY = 'hero-cover-perf';

/** Enable via `sessionStorage.setItem('hero-cover-perf', '1')` then reload. */
export function isHeroCoverPerfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function logHeroCoverPhase(phase: string, detail?: Record<string, unknown>): void {
  if (!isHeroCoverPerfEnabled()) return;

  console.debug('[hero-cover-perf]', phase, Math.round(performance.now()), detail ?? '');
}
