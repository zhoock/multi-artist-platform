/**
 * Waits for hero cover `<img>` load + decode, then yields two paint frames before callback.
 * Used to defer heavy Hero Universe3D work until after LCP paint opportunity.
 */
export function scheduleHeroCoverImagePaintReady(
  img: HTMLImageElement,
  onReadyForPaint: () => void
): () => void {
  let cancelled = false;
  let rafId1 = 0;
  let rafId2 = 0;

  const notifyAfterPaintFrames = () => {
    if (cancelled) return;
    rafId1 = requestAnimationFrame(() => {
      if (cancelled) return;
      rafId2 = requestAnimationFrame(() => {
        if (cancelled) return;
        onReadyForPaint();
      });
    });
  };

  const run = async () => {
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    }

    if (cancelled) return;

    try {
      if (typeof img.decode === 'function') {
        await img.decode();
      }
    } catch {
      // Proceed — browser may still paint from loaded bytes.
    }

    if (cancelled) return;
    notifyAfterPaintFrames();
  };

  void run();

  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId1);
    if (rafId2) cancelAnimationFrame(rafId2);
  };
}
