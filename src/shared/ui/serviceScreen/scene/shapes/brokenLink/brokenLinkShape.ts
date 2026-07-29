import { buildShapeDefinition } from '../shapeUtils';
import type { ShapeDefinition, ShapeFactory } from '../types';

type Vec3 = [number, number, number];

const SPINE_SEGMENT_COUNT = 128;
/** Pre-generated pool — Matter resamples to quality tier (up to ultra). */
const CLOUD_POOL_SIZE = 25000;
const BAND_MAX_RADIUS = 0.028;

type Vec2 = [number, number];

function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function toVec3([x, y]: Vec2): Vec3 {
  return [x, y, 0];
}

function sampleLine(a: Vec2, b: Vec2, count: number, skipFirst = false): Vec3[] {
  const points: Vec3[] = [];
  const start = skipFirst ? 1 : 0;

  for (let i = start; i <= count; i++) {
    points.push(toVec3(lerp2(a, b, i / count)));
  }

  return points;
}

function sampleCubic(
  a: Vec2,
  c1: Vec2,
  c2: Vec2,
  b: Vec2,
  count: number,
  skipFirst = false
): Vec3[] {
  const points: Vec3[] = [];
  const start = skipFirst ? 1 : 0;

  for (let i = start; i <= count; i++) {
    const t = i / count;
    const u = 1 - t;
    points.push(
      toVec3([
        u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0],
        u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1],
      ])
    );
  }

  return points;
}

function concatZones(zones: Vec3[][]): Vec3[] {
  const spine: Vec3[] = [];

  zones.forEach((zone, index) => {
    spine.push(...zone.slice(index === 0 ? 0 : 1));
  });

  return spine;
}

/** Deterministic [0, 1) — no Math.random, stable across reloads. */
function hashUnit(seed: number, channel: number): number {
  const value = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Chain-link spine in four logical zones:
 * bottom bar → outer arc → top bar → inner neck (V pinch toward break).
 *
 * `facing`: +1 opens toward +x (left link), −1 opens toward −x (right link).
 */
export function generateLinkSpine(
  anchorX: number,
  facing: 1 | -1,
  segmentCount = SPINE_SEGMENT_COUNT
): Vec3[] {
  const perZone = Math.max(8, Math.floor(segmentCount / 4));
  const g = facing;

  const outerFlatX = anchorX - g * 0.17;
  const outerBulgeX = anchorX - g * 0.27;
  const innerEdgeX = anchorX + g * 0.2;
  const neckPinchX = anchorX + g * 0.3;
  const halfH = 0.145;

  const innerBottom: Vec2 = [innerEdgeX, -halfH];
  const innerTop: Vec2 = [innerEdgeX, halfH];
  const outerBottom: Vec2 = [outerFlatX, -halfH];
  const outerTop: Vec2 = [outerFlatX, halfH];
  const neckPinch: Vec2 = [neckPinchX, 0];

  const bottomTransition = sampleLine(innerBottom, outerBottom, perZone);
  const outerArc = sampleCubic(
    outerBottom,
    [outerBulgeX, outerBottom[1]],
    [outerBulgeX, outerTop[1]],
    outerTop,
    perZone,
    true
  );
  const topTransition = sampleLine(outerTop, innerTop, perZone, true);
  const innerNeckTop = sampleLine(innerTop, neckPinch, perZone, true);
  const innerNeckBottom = sampleLine(neckPinch, innerBottom, perZone, true);

  return concatZones([bottomTransition, outerArc, topTransition, innerNeckTop, innerNeckBottom]);
}

function computeArcLengths(spine: Vec3[]): { cumulative: number[]; total: number } {
  const cumulative = [0];

  for (let i = 0; i < spine.length; i++) {
    const a = spine[i];
    const b = spine[(i + 1) % spine.length];
    cumulative.push(cumulative[i]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }

  return { cumulative, total: cumulative[spine.length]! };
}

function sampleSpineFrame(
  spine: Vec3[],
  cumulative: number[],
  total: number,
  t: number
): { x: number; y: number; tx: number; ty: number; nx: number; ny: number } {
  const target = t * total;
  let segment = 0;

  while (segment < spine.length && cumulative[segment + 1]! < target) {
    segment++;
  }

  const segStart = cumulative[segment]!;
  const segEnd = cumulative[segment + 1]!;
  const segLen = segEnd - segStart || 1;
  const localT = (target - segStart) / segLen;
  const a = spine[segment]!;
  const b = spine[(segment + 1) % spine.length]!;
  const x = a[0] + (b[0] - a[0]) * localT;
  const y = a[1] + (b[1] - a[1]) * localT;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;

  return { x, y, tx, ty, nx: -ty, ny: tx };
}

/** Thickness multiplier: max on outer arc, min at inner neck pinch. */
function thicknessAlongArc(arcT: number): number {
  const outerMid = 0.3;
  const outerHalf = 0.11;
  const neckPinch = 0.8;

  const outerU = (arcT - outerMid) / outerHalf;
  const outerBoost = Math.max(0, 1 - outerU * outerU);

  const neckU = (arcT - neckPinch) / 0.14;
  const neckCut = Math.max(0, 1 - neckU * neckU);

  return 0.58 + 0.42 * outerBoost - 0.28 * neckCut;
}

function gaussianAbs(seed: number, channel: number): number {
  const u1 = Math.max(hashUnit(seed, channel), 1e-6);
  const u2 = hashUnit(seed, channel + 7);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.abs(z);
}

function gaussianSignedPair(seed: number, channelA: number, channelB: number): [number, number] {
  const u1 = Math.max(hashUnit(seed, channelA), 1e-6);
  const u2 = hashUnit(seed, channelB);
  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

function fadeNoise(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function latticeNoise(ix: number, iy: number): number {
  return hashUnit(ix * 374761 + iy * 668265, 19);
}

/** Low-frequency coherent noise — large density islands, no fine grain. */
function coherentNoise2(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fadeNoise(x - x0);
  const fy = fadeNoise(y - y0);
  const v00 = latticeNoise(x0, y0);
  const v10 = latticeNoise(x0 + 1, y0);
  const v01 = latticeNoise(x0, y0 + 1);
  const v11 = latticeNoise(x0 + 1, y0 + 1);
  const ix = v00 + (v10 - v00) * fx;
  const iy = v01 + (v11 - v01) * fx;
  return ix + (iy - ix) * fy;
}

function matterField(x: number, y: number, seedOffset: number): number {
  const bias = seedOffset * 0.00037;
  const low = coherentNoise2(x * 1.65 + bias, y * 1.65 + bias * 1.3);
  const mid = coherentNoise2(x * 3.1 + 41.2, y * 3.1 + 17.8) * 0.28;
  return Math.min(1, Math.max(0, low * 0.78 + mid + 0.08));
}

/** Fade density on the last ~18% of inner neck toward the break. */
function neckDissolveFactor(arcT: number): number {
  const neckStart = 0.58;
  const neckSpan = 1 - neckStart;
  const fadeStart = neckStart + neckSpan * 0.82;

  if (arcT < fadeStart) {
    return 1;
  }

  return Math.max(0, 1 - (arcT - fadeStart) / (neckSpan * 0.18));
}

function computeSpineCentroid(spine: Vec3[]): Vec2 {
  let x = 0;
  let y = 0;

  spine.forEach(([px, py]) => {
    x += px;
    y += py;
  });

  return [x / spine.length, y / spine.length];
}

function emitCoreBandParticle(
  particles: Vec3[],
  frame: { x: number; y: number; tx: number; ty: number; nx: number; ny: number },
  seed: number,
  thickness: number,
  dissolve: number,
  isDust: boolean
): void {
  const coreSigma = BAND_MAX_RADIUS * 0.34 * thickness * Math.max(0.35, dissolve);
  const perpZ = gaussianAbs(seed, 4);
  const [tanA, tanB] = gaussianSignedPair(seed, 5, 6);
  const sigmaPerp = isDust ? coreSigma * 2.8 : coreSigma;
  const sigmaTan = sigmaPerp * 2.5;
  const side = hashUnit(seed, 8) < 0.5 ? -1 : 1;
  const perpMag = Math.min(perpZ, isDust ? 3.6 : 2.2) * sigmaPerp * side;
  const tanMag = tanA * sigmaTan * 0.55 + tanB * sigmaTan * 0.25;

  particles.push([
    frame.x + frame.nx * perpMag + frame.tx * tanMag,
    frame.y + frame.ny * perpMag + frame.ty * tanMag,
    0,
  ]);
}

function emitInteriorParticle(
  particles: Vec3[],
  frame: { x: number; y: number; tx: number; ty: number; nx: number; ny: number },
  centroid: Vec2,
  seed: number,
  thickness: number,
  dissolve: number,
  seedOffset: number
): void {
  const toCenterX = centroid[0] - frame.x;
  const toCenterY = centroid[1] - frame.y;
  const inwardLen = Math.hypot(toCenterX, toCenterY) || 1;
  const inwardX = toCenterX / inwardLen;
  const inwardY = toCenterY / inwardLen;
  const [tanJitterA, tanJitterB] = gaussianSignedPair(seed, 12, 13);
  const tanJitter = (tanJitterA * 0.65 + tanJitterB * 0.35) * BAND_MAX_RADIUS * 1.6 * thickness;

  const probeDepth = inwardLen * (0.22 + hashUnit(seed, 10) * 0.58);
  const probeX = frame.x + inwardX * probeDepth + frame.tx * tanJitter;
  const probeY = frame.y + inwardY * probeDepth + frame.ty * tanJitter;
  const island = matterField(probeX, probeY, seedOffset);
  const accept = island * dissolve;

  if (hashUnit(seed, 11) > accept * 0.92 + 0.06) {
    const shallow = inwardLen * (0.06 + island * 0.1);
    particles.push([frame.x + inwardX * shallow, frame.y + inwardY * shallow, 0]);
    return;
  }

  const depth = inwardLen * (0.12 + hashUnit(seed, 14) * 0.78 * island) * Math.max(0.25, dissolve);
  particles.push([
    frame.x + inwardX * depth + frame.tx * tanJitter * 0.45,
    frame.y + inwardY * depth + frame.ty * tanJitter * 0.45,
    0,
  ]);
}

/**
 * Dense golden matter along spine — Gaussian core band + interior volume fill.
 * Coherent low-frequency density islands; neck dissolves toward the break.
 */
function generateCloudAlongSpine(spine: Vec3[], count: number, seedOffset: number): Vec3[] {
  const { cumulative, total } = computeArcLengths(spine);
  const particles: Vec3[] = [];
  const centroid = computeSpineCentroid(spine);
  const breakDirX = centroid[0] < 0 ? 1 : -1;

  for (let i = 0; i < count; i++) {
    const seed = seedOffset + i;
    const kind = hashUnit(seed, 0);

    if (kind < 0.025) {
      const arcT = 0.58 + hashUnit(seed, 1) * 0.38;
      const dissolve = neckDissolveFactor(arcT);
      if (hashUnit(seed, 15) > dissolve) {
        continue;
      }
      const frame = sampleSpineFrame(spine, cumulative, total, arcT);
      const gapDepth = 0.035 + hashUnit(seed, 2) * 0.055;
      const gapSpread = (hashUnit(seed, 3) - 0.5) * 0.07;
      particles.push([frame.x + breakDirX * gapDepth, frame.y + gapSpread, 0]);
      continue;
    }

    const arcT = hashUnit(seed, 1);
    const frame = sampleSpineFrame(spine, cumulative, total, arcT);
    const thickness = thicknessAlongArc(arcT);
    const dissolve = neckDissolveFactor(arcT);

    if (kind < 0.09) {
      emitCoreBandParticle(particles, frame, seed, thickness, dissolve, true);
      continue;
    }

    if (kind < 0.5) {
      emitCoreBandParticle(particles, frame, seed, thickness, dissolve, false);
      continue;
    }

    if (dissolve <= 0.02 && hashUnit(seed, 16) > dissolve / 0.02) {
      continue;
    }

    emitInteriorParticle(particles, frame, centroid, seed, thickness, dissolve, seedOffset);
  }

  return particles;
}

function flattenVertices(vertices: Vec3[]): Float32Array {
  const contour = new Float32Array(vertices.length * 3);

  vertices.forEach(([x, y, z], index) => {
    const ix = index * 3;
    contour[ix] = x;
    contour[ix + 1] = y;
    contour[ix + 2] = z;
  });

  return contour;
}

/** Spine-driven particle cloud — two mirrored chain links. */
function generateBrokenLinkCloudContour(): Float32Array {
  const leftSpine = generateLinkSpine(-0.36, 1);
  const rightSpine = generateLinkSpine(0.36, -1);
  const half = CLOUD_POOL_SIZE / 2;
  const leftCloud = generateCloudAlongSpine(leftSpine, half, 0);
  const rightCloud = generateCloudAlongSpine(rightSpine, half, half);

  return flattenVertices([...leftCloud, ...rightCloud]);
}

/** Concept #16 — broken-link shape (spine + matter band). */
export const createBrokenLinkShape: ShapeFactory = (): ShapeDefinition =>
  buildShapeDefinition(generateBrokenLinkCloudContour());
