/** Canvas layout for genre (cluster) labels in Universe3D nebula sprites. */
export const CLUSTER_LABEL_CANVAS = {
  width: 512,
  height: 160,
  textX: 256,
  textY: 80,
  font: '700 48px Arial',
} as const;

export const CLUSTER_LABEL_SPRITE_HEIGHT_FR =
  CLUSTER_LABEL_CANVAS.height / CLUSTER_LABEL_CANVAS.width;

export type ClusterLabelFogRgb = { r: number; g: number; b: number };

export type ClusterLabelFogLayer = {
  blurPx: number;
  alpha: number;
  offsetX: number;
  offsetY: number;
  scaleX?: number;
  scaleY?: number;
  rotateRad?: number;
};

/** Back-to-front paint passes: wide soft halo → tighter mist → faint core (no hard shadow). */
export const CLUSTER_LABEL_FOG_LAYERS: readonly ClusterLabelFogLayer[] = [
  { blurPx: 22, alpha: 0.09, offsetX: 0, offsetY: 0 },
  {
    blurPx: 14,
    alpha: 0.13,
    offsetX: 2,
    offsetY: -1,
    scaleX: 1.012,
    scaleY: 0.992,
    rotateRad: 0.006,
  },
  { blurPx: 9, alpha: 0.16, offsetX: -1.5, offsetY: 1.2 },
  { blurPx: 5, alpha: 0.19, offsetX: 0.8, offsetY: -0.4 },
  { blurPx: 2.5, alpha: 0.22, offsetX: 0, offsetY: 0 },
];

export const CLUSTER_LABEL_DEPTH = {
  fadeStart: 5,
  fadeEnd: 3,
  opacityMin: 0.12,
  opacityMax: 0.76,
  opacityNearestBoost: 1.14,
  opacityNearestCap: 0.86,
  tintMin: 0.58,
  tintMax: 1,
} as const;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function computeClusterLabelDepthOpacity(
  distance: number,
  isNearest: boolean,
  cfg: typeof CLUSTER_LABEL_DEPTH = CLUSTER_LABEL_DEPTH
): number {
  const t = clamp01((cfg.fadeStart - distance) / (cfg.fadeStart - cfg.fadeEnd));
  if (t <= 0) {
    return 0;
  }
  const fogBlend = smoothstep(t);
  let opacity = cfg.opacityMin + fogBlend * (cfg.opacityMax - cfg.opacityMin);
  if (isNearest) {
    opacity = Math.min(cfg.opacityNearestCap, opacity * cfg.opacityNearestBoost);
  }
  return opacity;
}

export function computeClusterLabelDepthTint(
  distance: number,
  isNearest: boolean,
  cfg: typeof CLUSTER_LABEL_DEPTH = CLUSTER_LABEL_DEPTH
): number {
  const t = clamp01((cfg.fadeStart - distance) / (cfg.fadeStart - cfg.fadeEnd));
  const fogBlend = t * t;
  let tint = cfg.tintMin + fogBlend * (cfg.tintMax - cfg.tintMin);
  if (isNearest) {
    tint = Math.min(1, tint * 1.06);
  }
  return tint;
}

/**
 * Paints genre title as soft nebula gas (multi-blur layers, cluster color, no text-shadow stroke).
 */
export function drawNebulaClusterLabelOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: ClusterLabelFogRgb,
  size: { width: number; height: number } = CLUSTER_LABEL_CANVAS
): void {
  const { textX, textY, font } = CLUSTER_LABEL_CANVAS;
  const fill = `rgb(${color.r}, ${color.g}, ${color.b})`;

  ctx.clearRect(0, 0, size.width, size.height);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const layer of CLUSTER_LABEL_FOG_LAYERS) {
    ctx.save();
    const hasFilter = typeof ctx.filter === 'string';
    if (hasFilter) {
      ctx.filter = `blur(${layer.blurPx}px)`;
    }
    ctx.globalAlpha = layer.alpha;
    ctx.fillStyle = fill;

    const ox = textX + layer.offsetX;
    const oy = textY + layer.offsetY;
    const hasTransform =
      layer.rotateRad !== undefined || layer.scaleX !== undefined || layer.scaleY !== undefined;

    if (hasTransform) {
      ctx.translate(ox, oy);
      if (layer.rotateRad) {
        ctx.rotate(layer.rotateRad);
      }
      ctx.scale(layer.scaleX ?? 1, layer.scaleY ?? 1);
      ctx.fillText(text, -layer.offsetX, -layer.offsetY);
    } else {
      ctx.fillText(text, ox, oy);
    }

    ctx.restore();
  }

  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}
