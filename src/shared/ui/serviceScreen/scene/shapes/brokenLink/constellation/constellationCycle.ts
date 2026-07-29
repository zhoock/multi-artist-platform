import * as THREE from 'three';
import {
  BROKEN_LINK,
  CONSTELLATION_LINKS,
  CONSTELLATION_NODES,
  type ConstellationNodeId,
} from './constellationData';

export const BRIDGE_LINK = BROKEN_LINK;

/** All drawable links: arcs + bridge shown only when assembled. */
export const ANIMATED_LINKS = [...CONSTELLATION_LINKS, BRIDGE_LINK] as const;

const LEFT_HALF = new Set<ConstellationNodeId>([
  's06',
  's00',
  's01',
  's02',
  's03',
  's04',
  's05',
  's14',
  's15',
  's18',
  's20',
  's22',
]);

/** Fade order: bridge first, then outward along both arcs. */
const LINK_BREAK_ORDER = [10, 4, 9, 3, 8, 2, 7, 1, 6, 0, 5];

const HOLD_ASSEMBLED_S = 0.8;
const BREAK_S = 4;
const HOLD_BROKEN_S = 2.5;
const RESTORE_S = 4.5;
const CYCLE_S = HOLD_ASSEMBLED_S + BREAK_S + HOLD_BROKEN_S + RESTORE_S;

/** Lines fade first; separation follows on one continuous outward curve. */
const SEPARATION_DELAY = 0.38;

/** Separation distance between halves after break. */
const HALF_SEPARATION = 0.118;

function hashUnit(seed: string, channel: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const value = Math.sin(hash * 127.1 + channel * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function ambientStarDrift(nodeId: string, elapsed: number): THREE.Vector3 {
  const phase = hashUnit(nodeId, 0) * Math.PI * 2;
  const speed = 0.22 + hashUnit(nodeId, 1) * 0.16;
  return new THREE.Vector3(
    0,
    Math.cos(elapsed * speed * 0.86 + phase * 1.35) * 0.0012,
    Math.sin(elapsed * speed * 0.55 + phase * 0.6) * 0.0003
  );
}

export type ConstellationCycleMode = 'loop' | 'birth' | 'lost';

export type ConstellationCycleState = {
  mode: ConstellationCycleMode;
  breakAmount: number;
  isRestoring: boolean;
  linkStrength: Float32Array;
  /** 0–1 progress along link length (birth draws lines; loop uses full segment). */
  linkDrawProgress: Float32Array;
  nodeOffsets: Map<ConstellationNodeId, THREE.Vector3>;
  animatedPositions: Map<ConstellationNodeId, THREE.Vector3>;
  particleDrive: Float32Array;
  calm: boolean;
  /** Per-link wave brightness boost (0 = none). Birth mode only. */
  linkWaveBoost: Float32Array;
  /** Per-node wave glow boost (0 = none). Birth mode only. */
  nodeGlowBoost: Map<ConstellationNodeId, number>;
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Single monotonic outward factor — never reverses mid-break. */
function breakSeparationFactor(rawBreakT: number): number {
  if (rawBreakT <= 0) {
    return 0;
  }

  if (rawBreakT <= SEPARATION_DELAY) {
    const lead = rawBreakT / SEPARATION_DELAY;
    return smoothstep(0, 1, lead) * 0.1;
  }

  const sepT = (rawBreakT - SEPARATION_DELAY) / (1 - SEPARATION_DELAY);
  return 0.1 + easeOutCubic(sepT) * 0.9;
}

type PhaseSample = {
  breakAmount: number;
  separationFactor: number;
  linkDrive: number;
  rawBreakT: number;
  restoreT: number;
  restoring: boolean;
};

function samplePhase(cycleTime: number): PhaseSample {
  const breakStart = HOLD_ASSEMBLED_S;
  const brokenStart = breakStart + BREAK_S;
  const restoreStart = brokenStart + HOLD_BROKEN_S;

  if (cycleTime < breakStart) {
    return {
      breakAmount: 0,
      separationFactor: 0,
      linkDrive: 0,
      rawBreakT: 0,
      restoreT: 0,
      restoring: false,
    };
  }

  if (cycleTime < brokenStart) {
    const rawBreakT = (cycleTime - breakStart) / BREAK_S;
    const linkDrive = smoothstep(0, 1, rawBreakT);
    const separationFactor = breakSeparationFactor(rawBreakT);
    return {
      breakAmount: Math.min(1, linkDrive),
      separationFactor,
      linkDrive,
      rawBreakT,
      restoreT: 0,
      restoring: false,
    };
  }

  if (cycleTime < restoreStart) {
    return {
      breakAmount: 1,
      separationFactor: 1,
      linkDrive: 1,
      rawBreakT: 1,
      restoreT: 0,
      restoring: false,
    };
  }

  const restoreT = (cycleTime - restoreStart) / RESTORE_S;
  const restoreEase = easeInOutCubic(restoreT);

  return {
    breakAmount: 1 - restoreEase,
    separationFactor: 1 - restoreEase,
    linkDrive: 1 - restoreEase,
    rawBreakT: 1,
    restoreT: restoreEase,
    restoring: true,
  };
}

function linkStrengthBreaking(linkIndex: number, linkDrive: number): number {
  const orderIndex = LINK_BREAK_ORDER.indexOf(linkIndex);
  const threshold = orderIndex * 0.052;
  const fadeWidth = 0.078;

  if (linkDrive <= threshold) {
    return 1;
  }

  if (linkDrive >= threshold + fadeWidth) {
    return 0;
  }

  return 1 - smoothstep(threshold, threshold + fadeWidth, linkDrive);
}

function linkStrengthRestoring(linkIndex: number, restoreT: number): number {
  const orderIndex = LINK_BREAK_ORDER.indexOf(linkIndex);
  const reverseOrder = LINK_BREAK_ORDER.length - 1 - orderIndex;
  const threshold = reverseOrder * 0.048;
  const fadeWidth = 0.09;

  if (restoreT <= threshold) {
    return 0;
  }

  if (restoreT >= threshold + fadeWidth) {
    return 1;
  }

  return smoothstep(threshold, threshold + fadeWidth, restoreT);
}

const basePositions = new Map<ConstellationNodeId, THREE.Vector3>(
  CONSTELLATION_NODES.map((node) => [node.id, new THREE.Vector3(...node.position)])
);

/** Birth draw order — both arcs grow outward, bridge closes last. */
const LINK_BIRTH_ORDER = [0, 5, 1, 6, 2, 7, 3, 8, 4, 9, 10];

/** Scattered hold — same separation as expired broken state. */
const BIRTH_SCATTERED_HOLD_S = 0.8;
/** Halves converge — same easing as expired restore, without link fade. */
const BIRTH_CONVERGE_S = 4.5;
/** Lines begin halfway through convergence — stars still settling while links draw. */
const BIRTH_DRAW_START = BIRTH_SCATTERED_HOLD_S + BIRTH_CONVERGE_S * 0.5;
const BIRTH_DRAW_S = 3;
const BIRTH_WAVE_S = 2.2;
export const BIRTH_SEQUENCE_S = BIRTH_DRAW_START + BIRTH_DRAW_S + BIRTH_WAVE_S;
const BIRTH_LINK_DRAW_S = 0.32;

/** Wave propagation order from s11 (bridge destination — last reached star). */
const LINK_WAVE_ORDER = [5.5, 4.5, 3.5, 2.5, 1.5, 4.5, 3.5, 2.5, 1.5, 0.5, 0.5];
const MAX_LINK_WAVE_ORDER = 5.5;

const NODE_WAVE_ORDER = new Map<ConstellationNodeId, number>([
  ['s11', 0],
  ['s10', 1],
  ['s04', 1],
  ['s09', 2],
  ['s03', 2],
  ['s08', 3],
  ['s02', 3],
  ['s07', 4],
  ['s01', 4],
  ['s13', 5],
  ['s00', 5],
  ['s06', 6],
]);

function waveBell(front: number, center: number, width: number): number {
  const d = (front - center) / width;
  return Math.exp(-d * d);
}

function sampleBirthSeparation(elapsed: number): number {
  const convergeStart = BIRTH_SCATTERED_HOLD_S;
  const convergeEnd = convergeStart + BIRTH_CONVERGE_S;

  if (elapsed < convergeStart) {
    return 1;
  }

  if (elapsed < convergeEnd) {
    const convergeT = (elapsed - convergeStart) / BIRTH_CONVERGE_S;
    return 1 - easeInOutCubic(convergeT);
  }

  return 0;
}

function sampleBirthDrawProgress(elapsed: number): Float32Array {
  const progress = new Float32Array(ANIMATED_LINKS.length);

  if (elapsed < BIRTH_DRAW_START) {
    return progress;
  }

  const drawElapsed = elapsed - BIRTH_DRAW_START;
  const stagger =
    LINK_BIRTH_ORDER.length > 1
      ? (BIRTH_DRAW_S - BIRTH_LINK_DRAW_S) / (LINK_BIRTH_ORDER.length - 1)
      : 0;

  LINK_BIRTH_ORDER.forEach((linkIndex, orderIndex) => {
    const start = orderIndex * stagger;
    const end = start + BIRTH_LINK_DRAW_S;
    progress[linkIndex] =
      drawElapsed < start ? 0 : drawElapsed >= end ? 1 : smoothstep(start, end, drawElapsed);
  });

  return progress;
}

function sampleBirthWave(elapsed: number): {
  linkWaveBoost: Float32Array;
  nodeGlowBoost: Map<ConstellationNodeId, number>;
} {
  const linkWaveBoost = new Float32Array(ANIMATED_LINKS.length);
  const nodeGlowBoost = new Map<ConstellationNodeId, number>();

  const waveStart = BIRTH_DRAW_START + BIRTH_DRAW_S;
  const waveElapsed = elapsed - waveStart;

  if (waveElapsed < 0 || waveElapsed > BIRTH_WAVE_S) {
    return { linkWaveBoost, nodeGlowBoost };
  }

  const waveT = waveElapsed / BIRTH_WAVE_S;
  const front = waveT * (MAX_LINK_WAVE_ORDER + 0.6);
  const envelope = 1 - waveT * 0.12;
  const waveWidth = 0.78;

  for (let i = 0; i < ANIMATED_LINKS.length; i++) {
    linkWaveBoost[i] = waveBell(front, LINK_WAVE_ORDER[i]!, waveWidth) * envelope * 1.15;
  }

  NODE_WAVE_ORDER.forEach((order, nodeId) => {
    nodeGlowBoost.set(nodeId, waveBell(front, order, waveWidth) * envelope * 1.2);
  });

  return { linkWaveBoost, nodeGlowBoost };
}

function buildBirthPositions(
  elapsed: number,
  separationFactor: number
): {
  nodeOffsets: Map<ConstellationNodeId, THREE.Vector3>;
  animatedPositions: Map<ConstellationNodeId, THREE.Vector3>;
} {
  const nodeOffsets = new Map<ConstellationNodeId, THREE.Vector3>();
  const animatedPositions = new Map<ConstellationNodeId, THREE.Vector3>();
  const separation = HALF_SEPARATION * separationFactor;

  CONSTELLATION_NODES.forEach((node) => {
    const offset = new THREE.Vector3();
    const isLeft = LEFT_HALF.has(node.id);
    const side = isLeft ? -1 : 1;

    offset.x += side * separation;

    const drift = ambientStarDrift(node.id, elapsed);
    offset.add(drift);

    nodeOffsets.set(node.id, offset);

    const base = basePositions.get(node.id)!;
    animatedPositions.set(
      node.id,
      new THREE.Vector3(base.x + offset.x, base.y + offset.y, base.z + offset.z)
    );
  });

  return { nodeOffsets, animatedPositions };
}

export function computeConstellationBirthCycle(elapsed: number): ConstellationCycleState {
  const separationFactor = sampleBirthSeparation(elapsed);
  const linkDrawProgress = sampleBirthDrawProgress(elapsed);
  const linkStrength = new Float32Array(ANIMATED_LINKS.length);

  for (let i = 0; i < ANIMATED_LINKS.length; i++) {
    linkStrength[i] = linkDrawProgress[i]! >= 1 ? 1 : 0;
  }

  const calm = elapsed >= BIRTH_SEQUENCE_S;
  const converging =
    elapsed >= BIRTH_SCATTERED_HOLD_S && elapsed < BIRTH_SCATTERED_HOLD_S + BIRTH_CONVERGE_S;

  const { linkWaveBoost, nodeGlowBoost } = sampleBirthWave(elapsed);
  const { nodeOffsets, animatedPositions } = buildBirthPositions(elapsed, separationFactor);

  return {
    mode: 'birth',
    breakAmount: separationFactor,
    isRestoring: converging,
    linkStrength,
    linkDrawProgress,
    nodeOffsets,
    animatedPositions,
    particleDrive: new Float32Array(ANIMATED_LINKS.length),
    calm,
    linkWaveBoost,
    nodeGlowBoost,
  };
}

export function computeConstellationCycle(elapsed: number): ConstellationCycleState {
  const cycleTime = elapsed % CYCLE_S;
  const phase = samplePhase(cycleTime);
  const inMainMotion =
    (phase.rawBreakT > 0 && phase.rawBreakT < 1 && !phase.restoring) ||
    (phase.restoring && phase.restoreT > 0.04 && phase.restoreT < 0.96);
  const calm = !inMainMotion;

  const linkStrength = new Float32Array(ANIMATED_LINKS.length);
  const linkDrawProgress = new Float32Array(ANIMATED_LINKS.length);
  const particleDrive = new Float32Array(ANIMATED_LINKS.length);

  for (let i = 0; i < ANIMATED_LINKS.length; i++) {
    linkStrength[i] = phase.restoring
      ? linkStrengthRestoring(i, phase.restoreT)
      : linkStrengthBreaking(i, phase.linkDrive);

    linkDrawProgress[i] = linkStrength[i] > 0.02 ? 1 : 0;

    const orderIndex = LINK_BREAK_ORDER.indexOf(i);
    const fadeCenter = orderIndex * 0.052 + 0.038;
    const driveWidth = phase.restoring ? 0.008 : 0.006;
    const drive = Math.exp(-((phase.linkDrive - fadeCenter) ** 2) / driveWidth);
    particleDrive[i] = drive * (linkStrength[i] > 0.03 && linkStrength[i] < 0.9 ? 1 : 0);
  }

  const nodeOffsets = new Map<ConstellationNodeId, THREE.Vector3>();
  const animatedPositions = new Map<ConstellationNodeId, THREE.Vector3>();

  const separation = HALF_SEPARATION * phase.separationFactor;

  CONSTELLATION_NODES.forEach((node) => {
    const offset = new THREE.Vector3();
    const isLeft = LEFT_HALF.has(node.id);
    const side = isLeft ? -1 : 1;

    offset.x += side * separation;

    const drift = ambientStarDrift(node.id, elapsed);
    offset.add(drift);

    nodeOffsets.set(node.id, offset);

    const base = basePositions.get(node.id)!;
    animatedPositions.set(
      node.id,
      new THREE.Vector3(base.x + offset.x, base.y + offset.y, base.z + offset.z)
    );
  });

  return {
    mode: 'loop',
    breakAmount: phase.breakAmount,
    isRestoring: phase.restoring,
    linkStrength,
    linkDrawProgress,
    nodeOffsets,
    animatedPositions,
    particleDrive,
    calm,
    linkWaveBoost: new Float32Array(ANIMATED_LINKS.length),
    nodeGlowBoost: new Map(),
  };
}
