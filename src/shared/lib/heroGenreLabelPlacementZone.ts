/**
 * Hero genre label (Universe3D canvas) vs band photo (.hero__cover-image).
 * Uses the same painted geometry as layout — getBoundingClientRect, not assumed widths.
 */
export function measureHeroCoverPhotoLeftInCanvasPx(
  canvasEl: HTMLElement,
  heroRoot?: ParentNode | null
): number | null {
  const hero = heroRoot instanceof HTMLElement ? heroRoot : canvasEl.closest('.hero');
  if (!(hero instanceof HTMLElement) || !hero.classList.contains('hero--has-cover-image')) {
    return null;
  }

  const img = hero.querySelector('.hero__cover-image');
  if (!(img instanceof HTMLImageElement)) {
    return null;
  }

  const canvasRect = canvasEl.getBoundingClientRect();
  const imgRect = img.getBoundingClientRect();
  if (imgRect.width < 1 || imgRect.height < 1) {
    return null;
  }

  const photoLeftInCanvas = imgRect.left - canvasRect.left;
  if (photoLeftInCanvas >= canvasRect.width - 1) {
    return null;
  }

  return Math.max(0, photoLeftInCanvas);
}
