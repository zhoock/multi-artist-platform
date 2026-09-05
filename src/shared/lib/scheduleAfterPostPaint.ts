/**
 * Defer work until after the browser has painted the current frame (double rAF),
 * then optionally yield via requestIdleCallback so LCP can complete first.
 */
export function scheduleAfterPostPaint(onReady: () => void): () => void {
  let cancelled = false;
  let rafId1 = 0;
  let rafId2 = 0;
  let idleId: number | undefined;
  let timeoutId: number | undefined;

  const scheduleIdle = () => {
    if (cancelled) return;
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(onReady, { timeout: 2500 });
      return;
    }
    timeoutId = window.setTimeout(onReady, 150);
  };

  rafId1 = requestAnimationFrame(() => {
    if (cancelled) return;
    rafId2 = requestAnimationFrame(scheduleIdle);
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId1);
    if (rafId2) cancelAnimationFrame(rafId2);
    if (idleId !== undefined && typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(idleId);
    }
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  };
}
