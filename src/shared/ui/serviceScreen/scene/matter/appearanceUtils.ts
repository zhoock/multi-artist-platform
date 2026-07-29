import type { AppearanceProfile } from '../appearance/registry';

export function createSoftPointTexture(size = 64): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 236, 180, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 220, 140, 0.6)');
  gradient.addColorStop(0.65, 'rgba(201, 180, 88, 0.18)');
  gradient.addColorStop(1, 'rgba(201, 180, 88, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return canvas;
}

export function resolveAppearanceOpacity(
  appearance: AppearanceProfile,
  elapsedS: number,
  breathPeriodS: number
): number {
  const pulse = Math.sin((elapsedS * Math.PI * 2) / breathPeriodS) * appearance.opacityPulse;
  return appearance.baseOpacity + pulse;
}
