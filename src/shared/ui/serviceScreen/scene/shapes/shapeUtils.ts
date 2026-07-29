import type { ShapeBounds, ShapeDefinition, Vec3 } from './types';

export function computeBounds(contour: Float32Array): ShapeBounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < contour.length; i += 3) {
    min[0] = Math.min(min[0], contour[i]);
    min[1] = Math.min(min[1], contour[i + 1]);
    min[2] = Math.min(min[2], contour[i + 2]);
    max[0] = Math.max(max[0], contour[i]);
    max[1] = Math.max(max[1], contour[i + 1]);
    max[2] = Math.max(max[2], contour[i + 2]);
  }

  return { min, max };
}

export function computeCenter(bounds: ShapeBounds): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

export function buildShapeDefinition(contour: Float32Array): ShapeDefinition {
  const bounds = computeBounds(contour);

  return {
    contour,
    bounds,
    center: computeCenter(bounds),
  };
}
