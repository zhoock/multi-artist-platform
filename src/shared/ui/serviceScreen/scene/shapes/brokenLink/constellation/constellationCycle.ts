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

export type ConstellationCycleState = {
  breakAmount: number;
  isRestoring: boolean;
  linkStrength: Float32Array;
  nodeOffsets: Map<ConstellationNodeId, THREE.Vector3>;
  animatedPositions: Map<ConstellationNodeId, THREE.Vector3>;
  particleDrive: Float32Array;
  calm: boolean;
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

export function computeConstellationCycle(elapsed: number): ConstellationCycleState {
  const cycleTime = elapsed % CYCLE_S;
  const phase = samplePhase(cycleTime);
  const inMainMotion =
    (phase.rawBreakT > 0 && phase.rawBreakT < 1 && !phase.restoring) ||
    (phase.restoring && phase.restoreT > 0.04 && phase.restoreT < 0.96);
  const calm = !inMainMotion;

  const linkStrength = new Float32Array(ANIMATED_LINKS.length);
  const particleDrive = new Float32Array(ANIMATED_LINKS.length);

  for (let i = 0; i < ANIMATED_LINKS.length; i++) {
    linkStrength[i] = phase.restoring
      ? linkStrengthRestoring(i, phase.restoreT)
      : linkStrengthBreaking(i, phase.linkDrive);

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
    breakAmount: phase.breakAmount,
    isRestoring: phase.restoring,
    linkStrength,
    nodeOffsets,
    animatedPositions,
    particleDrive,
    calm,
  };
}
