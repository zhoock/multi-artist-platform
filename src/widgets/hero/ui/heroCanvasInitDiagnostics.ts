const STORAGE_KEY = 'hero-canvas-perf';

/** Enable via `sessionStorage.setItem('hero-canvas-perf', '1')` then reload. */
export function isHeroCanvasPerfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHeroCanvasInit(phase: string): void {
  if (!isHeroCanvasPerfEnabled()) return;
  performance.mark(`hero-canvas:${phase}`);
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[hero-canvas-perf]', phase, Math.round(performance.now()));
  }
}

export function reportHeroCanvasInitMeasures(): void {
  if (!isHeroCanvasPerfEnabled()) return;
  const phases = [
    'prefetch-module',
    'module-loaded',
    'init-start',
    'constructor-done',
    'webgl-canvas-in-dom',
  ];
  const origin = performance.getEntriesByName('hero-canvas:navigation-start', 'mark')[0];
  const t0 = origin?.startTime ?? 0;
  const rows: { phase: string; ms: number }[] = [];
  for (const phase of phases) {
    const entry = performance.getEntriesByName(`hero-canvas:${phase}`, 'mark')[0];
    if (entry) {
      rows.push({ phase, ms: Math.round(entry.startTime - t0) });
    }
  }
  if (rows.length > 0) {
    console.table(rows);
  }
}
