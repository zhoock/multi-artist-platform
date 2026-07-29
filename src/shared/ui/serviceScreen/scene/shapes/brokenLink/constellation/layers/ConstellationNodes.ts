import * as THREE from 'three';
import { CONSTELLATION_NODES, isBrightNode } from '../constellationData';
import type { ConstellationCycleState } from '../constellationCycle';

export type ConstellationNodesLayer = {
  group: THREE.Group;
  update(elapsed: number, cycle: ConstellationCycleState): void;
  dispose(): void;
};

type StarTier = 'bright' | 'mid' | 'dim';

type TierConfig = {
  tier: StarTier;
  baseSize: number;
  baseOpacity: number;
  color: number;
};

const TIER_CONFIGS: TierConfig[] = [
  { tier: 'dim', baseSize: 0.048, baseOpacity: 0.7, color: 0xfff0cc },
  { tier: 'mid', baseSize: 0.062, baseOpacity: 0.82, color: 0xfff0cc },
  { tier: 'bright', baseSize: 0.132, baseOpacity: 1, color: 0xfff8e8 },
];

function tierOf(node: (typeof CONSTELLATION_NODES)[number]): StarTier {
  if (isBrightNode(node.id)) {
    return 'bright';
  }
  if (node.size >= 0.062) {
    return 'mid';
  }
  return 'dim';
}

function hashUnit(seed: string, channel: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const value = Math.sin(hash * 127.1 + channel * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function twinkleAmplitude(node: (typeof CONSTELLATION_NODES)[number]): number {
  if (isBrightNode(node.id) || node.size >= 0.1) {
    return 0.15;
  }
  if (node.size >= 0.062) {
    return 0.12;
  }
  return 0.1;
}

type TierPoints = {
  points: THREE.Points;
  nodeIds: string[];
};

function createTierPoints(
  nodes: typeof CONSTELLATION_NODES,
  config: TierConfig,
  texture: THREE.Texture
): TierPoints | null {
  const tierNodes = nodes.filter((node) => tierOf(node) === config.tier);

  if (tierNodes.length === 0) {
    return null;
  }

  const positions = new Float32Array(tierNodes.length * 3);
  const colors = new Float32Array(tierNodes.length * 3);
  const phases = new Float32Array(tierNodes.length);
  const periods = new Float32Array(tierNodes.length);
  const amplitudes = new Float32Array(tierNodes.length);
  const nodeIds: string[] = [];

  const baseColor = new THREE.Color(config.color);

  tierNodes.forEach((node, i) => {
    nodeIds.push(node.id);
    const ix = i * 3;
    positions[ix] = node.position[0];
    positions[ix + 1] = node.position[1];
    positions[ix + 2] = node.position[2] + 0.02;

    colors[ix] = baseColor.r;
    colors[ix + 1] = baseColor.g;
    colors[ix + 2] = baseColor.b;

    phases[i] = hashUnit(node.id, 0) * Math.PI * 2;
    periods[i] = 4 + hashUnit(node.id, 1) * 4;
    amplitudes[i] = twinkleAmplitude(node);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    map: texture,
    color: 0xffffff,
    size: config.baseSize,
    sizeAttenuation: true,
    transparent: true,
    opacity: config.baseOpacity,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 3;
  points.userData.tierConfig = config;
  points.userData.phases = phases;
  points.userData.periods = periods;
  points.userData.amplitudes = amplitudes;
  points.userData.baseColor = baseColor;

  return { points, nodeIds };
}

export function createConstellationNodesLayer(texture: THREE.Texture): ConstellationNodesLayer {
  const group = new THREE.Group();
  const tiers: TierPoints[] = [];

  TIER_CONFIGS.forEach((config) => {
    const tier = createTierPoints(CONSTELLATION_NODES, config, texture);
    if (tier) {
      group.add(tier.points);
      tiers.push(tier);
    }
  });

  return {
    group,
    update(elapsed: number, cycle: ConstellationCycleState) {
      tiers.forEach(({ points, nodeIds }) => {
        const config = points.userData.tierConfig as TierConfig;
        const material = points.material as THREE.PointsMaterial;
        const phases = points.userData.phases as Float32Array;
        const periods = points.userData.periods as Float32Array;
        const amplitudes = points.userData.amplitudes as Float32Array;
        const baseColor = points.userData.baseColor as THREE.Color;
        const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colorAttr = points.geometry.getAttribute('color') as THREE.BufferAttribute;

        material.opacity = config.baseOpacity;

        for (let i = 0; i < nodeIds.length; i++) {
          const nodeId = nodeIds[i]!;
          const animated = cycle.animatedPositions.get(nodeId);
          const ix = i * 3;

          if (animated) {
            posAttr.array[ix] = animated.x;
            posAttr.array[ix + 1] = animated.y;
            posAttr.array[ix + 2] = animated.z + 0.02;
          }

          const twinkleScale =
            1 + amplitudes[i]! * Math.sin((elapsed * Math.PI * 2) / periods[i]! + phases[i]!);

          colorAttr.array[ix] = baseColor.r * twinkleScale;
          colorAttr.array[ix + 1] = baseColor.g * twinkleScale;
          colorAttr.array[ix + 2] = baseColor.b * twinkleScale;
        }

        posAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;
      });
    },
    dispose() {
      tiers.forEach(({ points }) => {
        points.geometry.dispose();
        (points.material as THREE.Material).dispose();
      });
    },
  };
}
