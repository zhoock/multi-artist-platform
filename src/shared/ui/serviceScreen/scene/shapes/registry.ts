import {
  create404Shape,
  createEnvelopeShape,
  createHexagonShape,
  createRingsShape,
  createSphereShape,
} from './placeholderShape';
import { createBrokenLinkShape } from './brokenLink/brokenLinkShape';
import type { ShapeDefinition, ShapeFactory, ShapeId } from './types';

export const SHAPES: Record<ShapeId, ShapeFactory> = {
  envelope: createEnvelopeShape,
  'broken-link': createBrokenLinkShape,
  '404': create404Shape,
  hexagon: createHexagonShape,
  sphere: createSphereShape,
  rings: createRingsShape,
};

export function createShape(id: ShapeId): ShapeDefinition {
  return SHAPES[id]();
}

export function getShapeFactory(id: ShapeId): ShapeFactory {
  return SHAPES[id];
}
