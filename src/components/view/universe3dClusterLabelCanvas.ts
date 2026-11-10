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

/**
 * Safari/mobile: subpixel text mass only (no shadowBlur, no ctx.filter).
 * Offsets stay under 0.5px; each pass uses very low alpha so edges thicken
 * slightly without the doubled “ghost” from the old fog offsets.
 */
export const CLUSTER_LABEL_MIST_FALLBACK_LAYERS = [
  { offsetX: 0.35, offsetY: 0, alpha: 0.036 },
  { offsetX: -0.35, offsetY: 0, alpha: 0.036 },
  { offsetX: 0, offsetY: 0.3, alpha: 0.036 },
  { offsetX: 0, offsetY: -0.3, alpha: 0.036 },
  { offsetX: 0.22, offsetY: 0.18, alpha: 0.032 },
  { offsetX: -0.22, offsetY: -0.18, alpha: 0.032 },
  { offsetX: 0.18, offsetY: -0.22, alpha: 0.032 },
  { offsetX: -0.18, offsetY: 0.22, alpha: 0.032 },
] as const;

/** Matches inner fog layer weight; avoids a crisp alpha-1 core on top. */
export const CLUSTER_LABEL_MIST_FALLBACK_CENTER_ALPHA = 0.22;

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

/** Inner padding from hero edges when placing the genre label (profile hero canvas). */
export const HERO_GENRE_LABEL_SAFE_PADDING = {
  mobile: 20,
  desktop: 32,
} as const;

/** Matches hero label scale animation ceiling in Universe3D (`maxScale`). */
export const HERO_CLUSTER_LABEL_MAX_WORLD_SCALE = 6;

export type ClusterLabelTextExtents = {
  width: number;
  height: number;
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function clampScalar(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Matches Universe3D mobile breakpoint (viewport width < 768px). */
export function getHeroGenreLabelSafePaddingPx(viewportWidth: number): number {
  return viewportWidth < 768
    ? HERO_GENRE_LABEL_SAFE_PADDING.mobile
    : HERO_GENRE_LABEL_SAFE_PADDING.desktop;
}

/** Extra canvas pixels around measured glyphs for fog blur + layer offsets. */
export function clusterLabelFogBleedPx(): { x: number; y: number } {
  let bleedX = 0;
  let bleedY = 0;
  for (const layer of CLUSTER_LABEL_FOG_LAYERS) {
    bleedX = Math.max(bleedX, layer.blurPx + Math.abs(layer.offsetX));
    bleedY = Math.max(bleedY, layer.blurPx + Math.abs(layer.offsetY));
  }
  return { x: bleedX, y: bleedY };
}

export function measureClusterLabelTextExtents(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string = CLUSTER_LABEL_CANVAS.font
): ClusterLabelTextExtents {
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent ?? 36;
  const descent = metrics.actualBoundingBoxDescent ?? 11;
  const bleed = clusterLabelFogBleedPx();
  return {
    width: metrics.width + bleed.x * 2,
    height: ascent + descent + bleed.y * 2,
  };
}

export function measureClusterLabelTextExtentsForText(text: string): ClusterLabelTextExtents {
  if (typeof document === 'undefined') {
    const approxWidth = text.length * 26;
    const bleed = clusterLabelFogBleedPx();
    return { width: approxWidth + bleed.x * 2, height: 48 + bleed.y * 2 };
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const bleed = clusterLabelFogBleedPx();
    return { width: text.length * 26 + bleed.x * 2, height: 48 + bleed.y * 2 };
  }
  return measureClusterLabelTextExtents(ctx, text);
}

export type HeroGenreLabelPlacementBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/** Allowed center positions so the label bounding box stays in the free hero region. */
export function computeHeroGenreLabelPlacementBounds(options: {
  heroWidth: number;
  heroHeight: number;
  labelWidth: number;
  labelHeight: number;
  safePadding: number;
  /** Left edge of artist photo in the same coordinate system as heroWidth (canvas layer). */
  photoAreaLeftPx?: number | null;
}): HeroGenreLabelPlacementBounds {
  const { heroWidth, heroHeight, labelWidth, labelHeight, safePadding, photoAreaLeftPx } = options;
  const halfW = labelWidth / 2;
  const halfH = labelHeight / 2;
  const minX = safePadding + halfW;
  let maxX = Math.max(minX, heroWidth - safePadding - halfW);
  if (photoAreaLeftPx != null && Number.isFinite(photoAreaLeftPx)) {
    const photoBoundCenter = photoAreaLeftPx - safePadding - halfW;
    maxX = Math.max(minX, Math.min(maxX, photoBoundCenter));
  }
  const minY = safePadding + halfH;
  const maxY = Math.max(minY, heroHeight - safePadding - halfH);
  return { minX, maxX, minY, maxY };
}

/**
 * Clamps a random hero-layer point so the full label box (text + fog) stays inside the hero.
 * When `photoAreaLeftPx` is set, guarantees `centerX + labelWidth/2 <= photoAreaLeftPx - safePadding`.
 */
export function clampHeroGenreLabelCenterPx(options: {
  heroWidth: number;
  heroHeight: number;
  labelWidth: number;
  labelHeight: number;
  safePadding: number;
  randomX: number;
  randomY: number;
  photoAreaLeftPx?: number | null;
}): { x: number; y: number } & HeroGenreLabelPlacementBounds {
  const { randomX, randomY, ...boundsInput } = options;
  const { minX, maxX, minY, maxY } = computeHeroGenreLabelPlacementBounds(boundsInput);
  return {
    x: clampScalar(randomX, minX, maxX),
    y: clampScalar(randomY, minY, maxY),
    minX,
    maxX,
    minY,
    maxY,
  };
}

/** Uniform random center in the allowed box; falls back to midpoint when the box collapses. */
export function pickRandomHeroGenreLabelCenterPx(bounds: {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}): { x: number; y: number } {
  const { minX, maxX, minY, maxY } = bounds;
  const x = maxX > minX + 1e-6 ? minX + Math.random() * (maxX - minX) : (minX + maxX) / 2;
  const y = maxY > minY + 1e-6 ? minY + Math.random() * (maxY - minY) : (minY + maxY) / 2;
  return { x, y };
}

export function estimateHeroClusterLabelScreenSizePx(options: {
  textExtents: ClusterLabelTextExtents;
  viewportHeightPx: number;
  cameraFovDeg: number;
  cameraDistance: number;
  maxSpriteWorldScale?: number;
}): { width: number; height: number } {
  const {
    textExtents,
    viewportHeightPx,
    cameraFovDeg,
    cameraDistance,
    maxSpriteWorldScale = HERO_CLUSTER_LABEL_MAX_WORLD_SCALE,
  } = options;
  const worldW = maxSpriteWorldScale * (textExtents.width / CLUSTER_LABEL_CANVAS.width);
  const worldH =
    maxSpriteWorldScale *
    CLUSTER_LABEL_SPRITE_HEIGHT_FR *
    (textExtents.height / CLUSTER_LABEL_CANVAS.height);
  const vFov = (cameraFovDeg * Math.PI) / 180;
  const worldVisibleH = 2 * Math.tan(vFov / 2) * Math.max(cameraDistance, 1e-3);
  const pxPerWorld = viewportHeightPx / worldVisibleH;
  return { width: worldW * pxPerWorld, height: worldH * pxPerWorld };
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Matches Universe3D mobile breakpoint (viewport width < 768px). */
function isClusterLabelMobileViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.innerWidth < 768;
}

/** WebKit Safari (excludes Chromium, Firefox, and other non-Safari WebKit shells). */
function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  const isAppleWebKit = /AppleWebKit/i.test(ua);
  const isChromiumFamily = /Chrome|Chromium|CriOS|Edg|OPR|Opera|SamsungBrowser/i.test(ua);
  return isAppleWebKit && !isChromiumFamily && /Safari/i.test(ua);
}

/** Low-alpha subpixel passes + soft center (Safari/mobile only). */
function paintClusterLabelMistFallback(
  ctx: CanvasRenderingContext2D,
  text: string,
  textX: number,
  textY: number,
  fill: string
): void {
  ctx.save();
  ctx.filter = 'none';
  ctx.fillStyle = fill;

  for (const layer of CLUSTER_LABEL_MIST_FALLBACK_LAYERS) {
    ctx.globalAlpha = layer.alpha;
    ctx.fillText(text, textX + layer.offsetX, textY + layer.offsetY);
  }

  ctx.globalAlpha = CLUSTER_LABEL_MIST_FALLBACK_CENTER_ALPHA;
  ctx.fillText(text, textX, textY);
  ctx.restore();
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

  const useFallback = isClusterLabelMobileViewport() || isSafariBrowser();

  if (useFallback) {
    paintClusterLabelMistFallback(ctx, text, textX, textY, fill);
    return;
  }

  for (const layer of CLUSTER_LABEL_FOG_LAYERS) {
    ctx.save();
    ctx.filter = `blur(${layer.blurPx}px)`;
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
