import * as THREE from 'three';
import { ANIMATED_LINKS, type ConstellationCycleState } from './constellationCycle';
import { CONSTELLATION_NODES, type ConstellationNodeId } from './constellationData';

const BRIDGE_LINK_INDEX = ANIMATED_LINKS.length - 1;
const ARC_LINK_COUNT = BRIDGE_LINK_INDEX;

/** Duration of one full search attempt (build → peak → dissolve → pause). */
export const LOST_ATTEMPT_S = 22;

/** Elapsed time for prefers-reduced-motion — mid-search, ~8 visible links. */
export const LOST_STATIC_ELAPSED = LOST_ATTEMPT_S * 0.52;

/** Global attempt progress phases (0–1). */
const BUILD_START = 0.05;
const BUILD_END = 0.84;
const DISSOLVE_START = 0.64;
const DISSOLVE_END = 0.97;
const LINK_DRAW_WIDTH = 0.046;
/** Build phase splits: early chaos → clearer convergence before dissolve. */
const BUILD_CHAOS_END = 0.38;

function hashUnit(seed: number, channel: number): number {
  const value = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

type SearchRoute = {
  /** Link indices in sequential draw order (arc links only). */
  links: number[];
  /** Briefly tease the bridge link, never completing it. */
  teaseBridge?: boolean;
};

/**
 * Alternate search paths — each attempt follows one route sequentially.
 * Routes differ so the viewer sees the algorithm try different reconstructions.
 */
const SEARCH_ROUTES: SearchRoute[] = [
  { links: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { links: [5, 6, 7, 8, 9, 0, 1, 2, 3, 4] },
  { links: [0, 5, 1, 6, 2, 7, 3, 8, 4, 9] },
  { links: [4, 9, 3, 8, 2, 7, 1, 6, 0, 5] },
  { links: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], teaseBridge: true },
  { links: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
];

const basePositions = new Map<ConstellationNodeId, THREE.Vector3>(
  CONSTELLATION_NODES.map((node) => [node.id, new THREE.Vector3(...node.position)])
);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function ambientStarDrift(nodeId: string, elapsed: number): THREE.Vector3 {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) {
    hash = (hash * 31 + nodeId.charCodeAt(i)) | 0;
  }
  const phase = (Math.sin(hash * 127.1) * 43758.5453) % 1;
  const phaseNorm = phase < 0 ? phase + 1 : phase;
  const speed =
    0.22 +
    (Math.sin(hash * 311.7) * 43758.5453 - Math.floor(Math.sin(hash * 311.7) * 43758.5453)) * 0.16;
  return new THREE.Vector3(
    0,
    Math.cos(elapsed * speed * 0.86 + phaseNorm * Math.PI * 2 * 1.35) * 0.0012,
    Math.sin(elapsed * speed * 0.55 + phaseNorm * Math.PI * 2 * 0.6) * 0.0003
  );
}

type AttemptSample = {
  attemptProgress: number;
  routeIndex: number;
};

function sampleAttempt(elapsed: number): AttemptSample {
  const attemptIndex = Math.floor(elapsed / LOST_ATTEMPT_S);
  const attemptProgress = (elapsed % LOST_ATTEMPT_S) / LOST_ATTEMPT_S;
  const routeIndex = attemptIndex % SEARCH_ROUTES.length;

  return { attemptProgress, routeIndex };
}

/** When route alternates sides, draw slows — algorithm hesitates. */
function hesitationFactor(route: SearchRoute, orderIndex: number): number {
  if (orderIndex === 0) {
    return 1;
  }

  const prev = route.links[orderIndex - 1]!;
  const curr = route.links[orderIndex]!;
  const prevSide = prev <= 4 ? 0 : 1;
  const currSide = curr <= 4 ? 0 : 1;

  return prevSide !== currSide ? 0.58 : 1;
}

/** Uneven, overlapping start times — tighter gaps early, calmer later. */
function computeLinkStarts(route: SearchRoute, routeIndex: number, buildSpan: number): number[] {
  const starts: number[] = [];
  let cursor = BUILD_START;
  const routeLength = route.links.length;
  const baseGap = buildSpan / routeLength;
  const targetLastStart = BUILD_START + buildSpan * 0.9;

  route.links.forEach((linkIndex, orderIndex) => {
    starts.push(cursor);

    if (orderIndex < routeLength - 1) {
      const inChaos = orderIndex < 4;
      const gapScale = inChaos
        ? 0.28 + hashUnit(linkIndex + routeIndex, 1) * 0.38
        : 0.82 + hashUnit(linkIndex, 2) * 0.38;
      cursor += baseGap * gapScale;
    }
  });

  const firstStart = starts[0]!;
  const lastStart = starts[starts.length - 1]!;
  const span = lastStart - firstStart || 1;
  const targetSpan = targetLastStart - firstStart;

  return starts.map((start, orderIndex) => {
    const linkIndex = route.links[orderIndex]!;
    const jitter = (hashUnit(routeIndex * 13 + linkIndex, 0) - 0.5) * 0.028;
    return Math.max(BUILD_START, start + jitter);
  });
}

function falseProbeFlash(
  attemptProgress: number,
  linkIndex: number,
  routeIndex: number,
  orderIndex: number
): number {
  if (orderIndex < 2 || attemptProgress >= BUILD_CHAOS_END) {
    return 0;
  }

  const probeCenter =
    BUILD_START +
    hashUnit(linkIndex * 3 + routeIndex * 11, 3) * (BUILD_CHAOS_END - BUILD_START - 0.04);
  const probeHalf = 0.018 + hashUnit(linkIndex, 4) * 0.012;
  const dist = Math.abs(attemptProgress - probeCenter);

  if (dist >= probeHalf) {
    return 0;
  }

  return Math.sin((1 - dist / probeHalf) * Math.PI) * (0.14 + hashUnit(orderIndex, 5) * 0.1);
}

function linkBuildProgress(
  attemptProgress: number,
  linkStart: number,
  hesitate: number,
  linkIndex: number,
  routeIndex: number,
  orderIndex: number
): number {
  const drawWidth = LINK_DRAW_WIDTH * (0.62 + hashUnit(linkIndex + routeIndex * 5, 6) * 0.72);
  const probe = falseProbeFlash(attemptProgress, linkIndex, routeIndex, orderIndex);

  if (attemptProgress < linkStart) {
    return probe;
  }

  const drawT = (attemptProgress - linkStart) / (drawWidth / hesitate);
  const base = smoothstep(0, 1, drawT);
  const inChaos = attemptProgress < BUILD_CHAOS_END;

  if (!inChaos) {
    return Math.min(0.88, Math.max(base, probe));
  }

  const stutter = 0.14 * Math.sin(drawT * 13 + linkIndex * 2.7) * (1 - drawT * 0.65);
  const surge = drawT > 0.45 && drawT < 0.62 ? -0.08 : 0;

  return Math.max(probe, Math.min(0.88, base + stutter + surge));
}

function linkDissolveFactor(attemptProgress: number, dissolveStart: number): number {
  if (attemptProgress < dissolveStart) {
    return 1;
  }

  const fadeT = (attemptProgress - dissolveStart) / (DISSOLVE_END - dissolveStart);
  return 1 - smoothstep(0, 1, fadeT);
}

type LinkRejection = {
  linkIndex: number;
  fadeStart: number;
  fadeEnd: number;
};

/** Interior arc links get rejected mid-build — leaves gaps inside chains. */
function buildLinkRejections(
  route: SearchRoute,
  routeIndex: number,
  linkStarts: number[]
): LinkRejection[] {
  const rejections: LinkRejection[] = [];
  const routeLinks = route.links;

  const isInteriorArc = (linkIndex: number): boolean =>
    (linkIndex >= 1 && linkIndex <= 3) || (linkIndex >= 6 && linkIndex <= 8);

  routeLinks.forEach((linkIndex, orderIndex) => {
    if (!isInteriorArc(linkIndex)) {
      return;
    }

    const rejectRoll = hashUnit(routeIndex * 23 + linkIndex * 7, 13);
    if (rejectRoll > 0.52) {
      return;
    }

    const nextStart =
      orderIndex < routeLinks.length - 1 ? linkStarts[orderIndex + 1]! : BUILD_CHAOS_END;
    const fadeStart =
      nextStart +
      0.008 +
      hashUnit(linkIndex + routeIndex, 14) * (BUILD_CHAOS_END - nextStart) * 0.55;
    const fadeEnd = fadeStart + 0.018 + hashUnit(linkIndex, 15) * 0.022;

    if (fadeStart >= DISSOLVE_START - 0.04) {
      return;
    }

    rejections.push({ linkIndex, fadeStart, fadeEnd });
  });

  if (rejections.length < 2) {
    const forced: number[] = [];

    if (hashUnit(routeIndex, 16) > 0.45) {
      forced.push(1 + Math.floor(hashUnit(routeIndex, 17) * 3));
    }
    if (hashUnit(routeIndex, 18) > 0.4) {
      forced.push(6 + Math.floor(hashUnit(routeIndex, 19) * 3));
    }

    for (const linkIndex of forced) {
      if (rejections.some((r) => r.linkIndex === linkIndex)) {
        continue;
      }

      const orderIndex = routeLinks.indexOf(linkIndex);
      const anchorStart =
        orderIndex >= 0 ? linkStarts[orderIndex]! : BUILD_START + 0.08 + linkIndex * 0.02;
      const fadeStart = anchorStart + 0.06 + hashUnit(linkIndex + routeIndex, 20) * 0.08;
      const fadeEnd = fadeStart + 0.028;

      if (fadeStart < DISSOLVE_START - 0.04) {
        rejections.push({ linkIndex, fadeStart, fadeEnd });
      }
    }
  }

  return rejections;
}

function rejectionMultiplier(
  attemptProgress: number,
  linkIndex: number,
  rejections: LinkRejection[]
): number {
  let multiplier = 1;

  for (const rejection of rejections) {
    if (rejection.linkIndex !== linkIndex) {
      continue;
    }

    if (attemptProgress < rejection.fadeStart) {
      continue;
    }

    if (attemptProgress >= rejection.fadeEnd) {
      multiplier = 0;
      continue;
    }

    const fadeT =
      (attemptProgress - rejection.fadeStart) / (rejection.fadeEnd - rejection.fadeStart);
    multiplier = Math.min(multiplier, 1 - smoothstep(0, 1, fadeT));
  }

  return multiplier;
}

function sampleRouteLinks(
  attemptProgress: number,
  route: SearchRoute,
  routeIndex: number
): { linkStrength: Float32Array; linkDrawProgress: Float32Array } {
  const linkStrength = new Float32Array(ANIMATED_LINKS.length);
  const linkDrawProgress = new Float32Array(ANIMATED_LINKS.length);
  const routeLinks = route.links;
  const routeLength = routeLinks.length;
  const buildSpan = BUILD_END - BUILD_START - LINK_DRAW_WIDTH;
  const dissolveSpan = (DISSOLVE_END - DISSOLVE_START) * 0.58;
  const linkStarts = computeLinkStarts(route, routeIndex, buildSpan);
  const rejections = buildLinkRejections(route, routeIndex, linkStarts);

  routeLinks.forEach((linkIndex, orderIndex) => {
    const hesitate = hesitationFactor(route, orderIndex);
    const linkStart = linkStarts[orderIndex]!;
    const build = linkBuildProgress(
      attemptProgress,
      linkStart,
      hesitate,
      linkIndex,
      routeIndex,
      orderIndex
    );
    const dissolveStart = DISSOLVE_START + (orderIndex / routeLength) * dissolveSpan;
    const dissolve = linkDissolveFactor(attemptProgress, dissolveStart);
    const rejected = rejectionMultiplier(attemptProgress, linkIndex, rejections);
    const visibility = build * dissolve * rejected;

    linkDrawProgress[linkIndex] = visibility;
    linkStrength[linkIndex] = visibility > 0.015 ? visibility : 0;
  });

  if (route.teaseBridge && attemptProgress >= BUILD_START + buildSpan * 0.9) {
    const bridgeStart = BUILD_START + buildSpan * 0.9;
    const bridgeBuild = linkBuildProgress(
      attemptProgress,
      bridgeStart,
      0.4,
      BRIDGE_LINK_INDEX,
      routeIndex,
      routeLength
    );
    const bridgeDraw = Math.min(bridgeBuild * 0.32, 0.32);
    const bridgeDissolve = linkDissolveFactor(
      attemptProgress,
      DISSOLVE_START + dissolveSpan * 0.35
    );
    const bridgeVis = bridgeDraw * bridgeDissolve;

    linkDrawProgress[BRIDGE_LINK_INDEX] = bridgeVis;
    linkStrength[BRIDGE_LINK_INDEX] = bridgeVis > 0.015 ? bridgeVis : 0;
  }

  return { linkStrength, linkDrawProgress };
}

function buildLostPositions(elapsed: number): {
  nodeOffsets: Map<ConstellationNodeId, THREE.Vector3>;
  animatedPositions: Map<ConstellationNodeId, THREE.Vector3>;
} {
  const nodeOffsets = new Map<ConstellationNodeId, THREE.Vector3>();
  const animatedPositions = new Map<ConstellationNodeId, THREE.Vector3>();

  CONSTELLATION_NODES.forEach((node) => {
    const drift = ambientStarDrift(node.id, elapsed);
    nodeOffsets.set(node.id, drift);

    const base = basePositions.get(node.id)!;
    animatedPositions.set(
      node.id,
      new THREE.Vector3(base.x + drift.x, base.y + drift.y, base.z + drift.z)
    );
  });

  return { nodeOffsets, animatedPositions };
}

export function computeConstellationLostCycle(elapsed: number): ConstellationCycleState {
  const { attemptProgress, routeIndex } = sampleAttempt(elapsed);
  const route = SEARCH_ROUTES[routeIndex]!;
  const { linkStrength, linkDrawProgress } = sampleRouteLinks(attemptProgress, route, routeIndex);
  const { nodeOffsets, animatedPositions } = buildLostPositions(elapsed);

  return {
    mode: 'lost',
    breakAmount: 0,
    isRestoring: false,
    linkStrength,
    linkDrawProgress,
    nodeOffsets,
    animatedPositions,
    particleDrive: new Float32Array(ANIMATED_LINKS.length),
    calm: attemptProgress < BUILD_START || attemptProgress > DISSOLVE_END,
    linkWaveBoost: new Float32Array(ANIMATED_LINKS.length),
    nodeGlowBoost: new Map(),
  };
}

/** Count links with meaningful visibility. */
export function countVisibleLostLinks(state: ConstellationCycleState): number {
  let count = 0;

  for (let i = 0; i < state.linkDrawProgress.length; i++) {
    if (state.linkDrawProgress[i]! > 0.12) {
      count += 1;
    }
  }

  return count;
}

/** Test helper — verify constellation is never fully assembled. */
export function isLostConstellationIncomplete(state: ConstellationCycleState): boolean {
  if (state.linkDrawProgress[BRIDGE_LINK_INDEX]! > 0.5) {
    return false;
  }

  let strongArcs = 0;

  for (let i = 0; i < BRIDGE_LINK_INDEX; i++) {
    if (state.linkStrength[i]! > 0.9 && state.linkDrawProgress[i]! > 0.9) {
      strongArcs += 1;
    }
  }

  return strongArcs < ARC_LINK_COUNT;
}

export { sampleAttempt, SEARCH_ROUTES };
