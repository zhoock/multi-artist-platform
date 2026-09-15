/**
 * Pointer helpers for visually-hidden native range thumbs.
 * A 0×0 `visibility: hidden` thumb drops out of hit-testing, so we map clientX
 * onto the track ourselves and use pointer capture for drag.
 */

/** Maps a pointer X onto the native range track, including edges. */
export function nativeRangeValueFromClientX(el: HTMLInputElement, clientX: number): number | null {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const min = Number(el.min);
  const max = Number(el.max);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 100;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(lo + ratio * (hi - lo));
}

export function captureRangePointer(el: HTMLInputElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Synthetic/automation events may not have an active pointer.
  }
}

export function releaseRangePointer(el: HTMLInputElement, pointerId: number): void {
  try {
    if (el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore missing capture on synthetic events.
  }
}

export function applyNativeRangeFromClientX(
  el: HTMLInputElement,
  clientX: number,
  cssVar?: string
): number | null {
  const next = nativeRangeValueFromClientX(el, clientX);
  if (next == null) return null;
  el.value = String(next);
  if (cssVar) {
    el.style.setProperty(cssVar, `${next}%`);
  }
  return next;
}
