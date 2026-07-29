import { buildShapeDefinition } from './shapeUtils';
import type { ShapeDefinition, ShapeFactory } from './types';

const TAU = Math.PI * 2;

/** Fixed-resolution geometric contour — independent of render particle count. */
const CONTOUR_VERTEX_COUNT = 512;

function generatePlaceholderContour(): Float32Array {
  const contour = new Float32Array(CONTOUR_VERTEX_COUNT * 3);

  for (let i = 0; i < CONTOUR_VERTEX_COUNT; i++) {
    const angle = Math.random() * TAU;
    const lobes =
      0.62 +
      0.18 * Math.sin(angle * 2 + 0.4) +
      0.1 * Math.sin(angle * 5 - 0.8) +
      0.06 * Math.cos(angle * 9);
    const radius = Math.sqrt(Math.random()) * 0.42 * lobes;

    contour[i * 3] = Math.cos(angle) * radius;
    contour[i * 3 + 1] = Math.sin(angle) * radius * 1.32 - 0.04;
    contour[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
  }

  return contour;
}

/** Placeholder until Figma / SVG / AI shape specs arrive. */
export const createPlaceholderShape: ShapeFactory = () =>
  buildShapeDefinition(generatePlaceholderContour());

/** Design spec pending. */
export const createEnvelopeShape: ShapeFactory = createPlaceholderShape;

/** Design spec pending. */
export const create404Shape: ShapeFactory = createPlaceholderShape;

/** Design spec pending. */
export const createHexagonShape: ShapeFactory = createPlaceholderShape;

/** Design spec pending. */
export const createSphereShape: ShapeFactory = createPlaceholderShape;

/** Design spec pending. */
export const createRingsShape: ShapeFactory = createPlaceholderShape;
