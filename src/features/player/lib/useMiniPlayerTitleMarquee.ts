import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  measureMiniPlayerTitleOverflow,
  miniPlayerTitleMarqueeDurationSec,
  miniPlayerTitleMarqueeLoopDistancePx,
  prefersReducedMiniPlayerTitleMarquee,
} from './miniPlayerTitleMarquee';

export type MiniPlayerTitleMarqueeState = {
  active: boolean;
  loopDistancePx: number;
  durationSec: number;
};

const IDLE_MARQUEE: MiniPlayerTitleMarqueeState = {
  active: false,
  loopDistancePx: 0,
  durationSec: 0,
};

export function useMiniPlayerTitleMarquee(contentKey: string) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const segmentRef = useRef<HTMLSpanElement>(null);
  const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [marquee, setMarquee] = useState<MiniPlayerTitleMarqueeState>(IDLE_MARQUEE);

  const measure = useCallback(() => {
    if (prefersReducedMiniPlayerTitleMarquee()) {
      setMarquee(IDLE_MARQUEE);
      return;
    }

    const viewport = viewportRef.current;
    const segment = segmentRef.current;
    if (!viewport || !segment) {
      setMarquee(IDLE_MARQUEE);
      return;
    }

    const lineWidths = lineRefs.current
      .filter((node): node is HTMLSpanElement => node instanceof HTMLSpanElement)
      .filter((line) => {
        const style = window.getComputedStyle(line);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((line) => line.scrollWidth);

    const overflowPx = measureMiniPlayerTitleOverflow(viewport.clientWidth, lineWidths);
    if (overflowPx > 0) {
      const segmentWidthPx = Math.ceil(segment.scrollWidth);
      const loopDistancePx = miniPlayerTitleMarqueeLoopDistancePx(segmentWidthPx);
      setMarquee({
        active: true,
        loopDistancePx,
        durationSec: miniPlayerTitleMarqueeDurationSec(loopDistancePx),
      });
      return;
    }

    setMarquee(IDLE_MARQUEE);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [contentKey, measure]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => measure());
      resizeObserver.observe(viewport);

      const parent = viewport.closest('.mini-player');
      if (parent instanceof HTMLElement) {
        resizeObserver.observe(parent);
      }

      const segment = segmentRef.current;
      if (segment) resizeObserver.observe(segment);
    }

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [measure, contentKey]);

  const registerLineRef = useCallback((index: number) => {
    return (node: HTMLSpanElement | null) => {
      lineRefs.current[index] = node;
    };
  }, []);

  return { viewportRef, segmentRef, registerLineRef, marquee, measure };
}
