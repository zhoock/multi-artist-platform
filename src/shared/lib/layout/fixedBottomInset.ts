/** CSS custom property consumed by fixed bottom overlays (consent banner, hints, etc.). */
export const LAYOUT_FIXED_BOTTOM_INSET_VAR = '--layout-fixed-bottom-inset';

/**
 * Distance from the viewport bottom to the top edge of a fixed bottom element,
 * including its own block size and CSS `bottom` offset.
 */
export function measureFixedElementBottomInset(element: HTMLElement): number {
  const styles = getComputedStyle(element);
  const bottomOffset = Number.parseFloat(styles.bottom) || 0;

  return element.offsetHeight + bottomOffset;
}

export function setFixedBottomInset(px: number): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.style.setProperty(LAYOUT_FIXED_BOTTOM_INSET_VAR, `${Math.max(0, px)}px`);
}

export function clearFixedBottomInset(): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.style.removeProperty(LAYOUT_FIXED_BOTTOM_INSET_VAR);
}
