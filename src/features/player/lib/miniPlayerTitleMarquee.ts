/** Matches `--mini-player-title-marquee-gap` / `--ms-0` in PlayerShell styles. */
export const MINI_PLAYER_TITLE_MARQUEE_GAP_PX = 18;

export function measureMiniPlayerTitleOverflow(
  viewportClientWidth: number,
  lineScrollWidths: number[]
): number {
  if (viewportClientWidth <= 0 || lineScrollWidths.length === 0) return 0;

  const maxLineWidth = Math.max(...lineScrollWidths);
  const overflow = maxLineWidth - viewportClientWidth;
  return overflow > 1 ? Math.ceil(overflow) : 0;
}

export function miniPlayerTitleMarqueeLoopDistancePx(segmentWidthPx: number): number {
  return segmentWidthPx + MINI_PLAYER_TITLE_MARQUEE_GAP_PX;
}

/** Full cycle duration: initial pause (12% of timeline) + constant left scroll. */
export function miniPlayerTitleMarqueeDurationSec(loopDistancePx: number): number {
  const scrollSpeedPxPerSec = 28;
  const scrollPhaseRatio = 0.88;
  const scrollDuration = loopDistancePx / scrollSpeedPxPerSec;
  return scrollDuration / scrollPhaseRatio;
}

export function prefersReducedMiniPlayerTitleMarquee(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
