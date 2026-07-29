export type Vec3 = [number, number, number];

export type ShapeBounds = {
  min: Vec3;
  max: Vec3;
};

/** Pure geometry — no render quality. Matter samples contour into N particles. */
export type ShapeDefinition = {
  contour: Float32Array;
  bounds: ShapeBounds;
  center: Vec3;
};

export type ShapeId = 'envelope' | 'broken-link' | '404' | 'hexagon' | 'sphere' | 'rings';

export type ShapeFactory = () => ShapeDefinition;
