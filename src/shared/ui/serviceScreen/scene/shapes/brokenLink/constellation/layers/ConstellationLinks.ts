import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { ANIMATED_LINKS } from '../constellationCycle';
import type { ConstellationCycleState } from '../constellationCycle';
import { BROKEN_LINK, nodeMap } from '../constellationData';

const SEGMENT_PARTICLE_COUNT = 80;
const AMBIENT_DUST_COUNT = 5;

function hashUnit(seed: number, channel: number): number {
  const value = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function createSegmentLine(
  width: number,
  opacity: number,
  color: number,
  resolution: THREE.Vector2
): Line2 {
  const geometry = new LineGeometry();
  geometry.setPositions([0, 0, 0, 0, 0, 0]);

  const material = new LineMaterial({
    color,
    linewidth: width,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.resolution.copy(resolution);

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  line.renderOrder = 1;
  return line;
}

type LinePair = {
  fromId: string;
  toId: string;
  thin: Line2;
  glow: Line2;
  baseThinOpacity: number;
  baseGlowOpacity: number;
  breathPhase: number;
  breathPeriod: number;
};

type SegmentParticle = {
  linkIndex: number;
  along: number;
  seed: number;
  lateral: number;
  lift: number;
};

export type ConstellationLinksLayer = {
  group: THREE.Group;
  setResolution(width: number, height: number): void;
  update(elapsed: number, cycle: ConstellationCycleState): void;
  dispose(): void;
};

export function createConstellationLinksLayer(
  dustTexture: THREE.Texture,
  resolution: THREE.Vector2
): ConstellationLinksLayer {
  const nodes = nodeMap();
  const group = new THREE.Group();
  const linePairs: LinePair[] = [];

  ANIMATED_LINKS.forEach((link, linkIndex) => {
    const thinOpacity = linkIndex === ANIMATED_LINKS.length - 1 ? 0.048 : 0.055;
    const glowOpacity = linkIndex === ANIMATED_LINKS.length - 1 ? 0.095 : 0.11;

    const thin = createSegmentLine(0.62, thinOpacity, 0xffc870, resolution);
    const glow = createSegmentLine(1.35, glowOpacity, 0xffe8a8, resolution);

    linePairs.push({
      fromId: link.from,
      toId: link.to,
      thin,
      glow,
      baseThinOpacity: thinOpacity,
      baseGlowOpacity: glowOpacity,
      breathPhase: hashUnit(linkIndex + 1, 0) * Math.PI * 2,
      breathPeriod: 6 + hashUnit(linkIndex + 1, 1) * 4,
    });

    group.add(thin);
    group.add(glow);
  });

  const particles: SegmentParticle[] = [];
  for (let i = 0; i < SEGMENT_PARTICLE_COUNT; i++) {
    particles.push({
      linkIndex: Math.floor(hashUnit(i + 1, 0) * ANIMATED_LINKS.length),
      along: hashUnit(i + 1, 1),
      seed: i * 1.73 + 2.11,
      lateral: (hashUnit(i + 1, 2) - 0.5) * 2,
      lift: (hashUnit(i + 1, 3) - 0.5) * 2,
    });
  }

  const particlePositions = new Float32Array(SEGMENT_PARTICLE_COUNT * 3);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    map: dustTexture,
    color: 0xffd080,
    size: 0.016,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particlePoints = new THREE.Points(particleGeometry, particleMaterial);
  particlePoints.renderOrder = 2;
  group.add(particlePoints);

  const breakFrom = nodes.get(BROKEN_LINK.from)!;
  const breakTo = nodes.get(BROKEN_LINK.to)!;
  const breakMid = new THREE.Vector3(
    (breakFrom.position[0] + breakTo.position[0]) * 0.5,
    (breakFrom.position[1] + breakTo.position[1]) * 0.5,
    0
  );

  const ambientSeeds = new Float32Array(AMBIENT_DUST_COUNT);
  const ambientPositions = new Float32Array(AMBIENT_DUST_COUNT * 3);
  for (let i = 0; i < AMBIENT_DUST_COUNT; i++) {
    ambientSeeds[i] = i * 2.91 + 0.7;
    ambientPositions[i * 3] = breakMid.x;
    ambientPositions[i * 3 + 1] = breakMid.y;
    ambientPositions[i * 3 + 2] = 0;
  }

  const ambientGeometry = new THREE.BufferGeometry();
  ambientGeometry.setAttribute('position', new THREE.BufferAttribute(ambientPositions, 3));
  const ambientMaterial = new THREE.PointsMaterial({
    map: dustTexture,
    color: 0xffd080,
    size: 0.011,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ambientDust = new THREE.Points(ambientGeometry, ambientMaterial);
  ambientDust.renderOrder = 2;
  group.add(ambientDust);

  function updateLineGeometry(line: Line2, from: THREE.Vector3, to: THREE.Vector3): void {
    const geometry = line.geometry as LineGeometry;
    geometry.setPositions([from.x, from.y, from.z, to.x, to.y, to.z]);
  }

  return {
    group,
    setResolution(width: number, height: number) {
      linePairs.forEach(({ thin, glow }) => {
        (thin.material as LineMaterial).resolution.set(width, height);
        (glow.material as LineMaterial).resolution.set(width, height);
      });
    },
    update(elapsed: number, cycle: ConstellationCycleState) {
      let particleVisibility = 0;

      linePairs.forEach((pair, linkIndex) => {
        const from = cycle.animatedPositions.get(pair.fromId);
        const to = cycle.animatedPositions.get(pair.toId);

        if (!from || !to) {
          return;
        }

        updateLineGeometry(pair.thin, from, to);
        updateLineGeometry(pair.glow, from, to);

        const strength = cycle.linkStrength[linkIndex] ?? 0;
        const breathScale = cycle.calm ? 0.05 : 0.032;
        const breath =
          1 +
          breathScale * Math.sin((elapsed * Math.PI * 2) / pair.breathPeriod + pair.breathPhase);

        (pair.thin.material as LineMaterial).opacity = pair.baseThinOpacity * strength * breath;
        (pair.glow.material as LineMaterial).opacity = pair.baseGlowOpacity * strength * breath;

        particleVisibility = Math.max(particleVisibility, cycle.particleDrive[linkIndex] ?? 0);
      });

      const posAttr = particleGeometry.getAttribute('position') as THREE.BufferAttribute;
      let activeCount = 0;

      for (let i = 0; i < SEGMENT_PARTICLE_COUNT; i++) {
        const particle = particles[i]!;
        const linkIndex = particle.linkIndex;
        const pair = linePairs[linkIndex];
        const drive = cycle.particleDrive[linkIndex] ?? 0;
        const strength = cycle.linkStrength[linkIndex] ?? 0;

        if (!pair || drive < 0.08 || strength > 0.95) {
          posAttr.array[i * 3 + 2] = -99;
          continue;
        }

        const from = cycle.animatedPositions.get(pair.fromId);
        const to = cycle.animatedPositions.get(pair.toId);

        if (!from || !to) {
          posAttr.array[i * 3 + 2] = -99;
          continue;
        }

        activeCount += 1;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const perpX = -dy / len;
        const perpY = dx / len;

        const dissolveShift = cycle.isRestoring ? (1 - strength) * 0.55 : (1 - strength) * 0.85;
        const along = particle.along + dissolveShift * (cycle.isRestoring ? -1 : 1);
        const clampedAlong = Math.max(0.02, Math.min(0.98, along));

        const scatter =
          drive *
          (cycle.isRestoring ? 0.004 : 0.032) *
          (1 + Math.sin(elapsed * 0.7 + particle.seed));

        const px = from.x + dx * clampedAlong + perpX * (particle.lateral * scatter);
        const py =
          from.y +
          dy * clampedAlong +
          perpY * (particle.lateral * scatter) +
          particle.lift * scatter * 0.6;
        const pz = Math.sin(elapsed * 0.5 + particle.seed) * scatter * 0.35;

        posAttr.array[i * 3] = px;
        posAttr.array[i * 3 + 1] = py;
        posAttr.array[i * 3 + 2] = pz;
      }

      posAttr.needsUpdate = true;
      particleMaterial.opacity = activeCount > 0 ? 0.16 + particleVisibility * 0.46 : 0;

      const ambientAttr = ambientGeometry.getAttribute('position') as THREE.BufferAttribute;
      const driftRadius = 0.09;

      for (let i = 0; i < AMBIENT_DUST_COUNT; i++) {
        const seed = ambientSeeds[i]!;
        const ix = i * 3;
        const mid = cycle.animatedPositions.get(BROKEN_LINK.from);
        const midTo = cycle.animatedPositions.get(BROKEN_LINK.to);
        const cx = mid && midTo ? (mid.x + midTo.x) * 0.5 : breakMid.x;
        const cy = mid && midTo ? (mid.y + midTo.y) * 0.5 : breakMid.y;

        ambientAttr.array[ix] =
          cx +
          Math.sin(elapsed * 0.11 + seed) * driftRadius * 0.45 +
          (hashUnit(seed, 1) - 0.5) * 0.02;
        ambientAttr.array[ix + 1] = cy + Math.cos(elapsed * 0.09 + seed * 1.2) * driftRadius * 0.38;
        ambientAttr.array[ix + 2] = Math.sin(elapsed * 0.13 + seed * 0.5) * 0.002;
      }

      ambientAttr.needsUpdate = true;
      ambientMaterial.opacity = 0.08 + Math.sin(elapsed * 0.31 + 0.8) * 0.025;
    },
    dispose() {
      linePairs.forEach(({ thin, glow }) => {
        thin.geometry.dispose();
        (thin.material as LineMaterial).dispose();
        glow.geometry.dispose();
        (glow.material as LineMaterial).dispose();
      });
      particleGeometry.dispose();
      particleMaterial.dispose();
      ambientGeometry.dispose();
      ambientMaterial.dispose();
    },
  };
}
