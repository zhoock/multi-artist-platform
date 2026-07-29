import * as THREE from 'three';

const STAR_COUNT = 4200;

function hashUnit(seed: number, channel: number): number {
  const value = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export type BackgroundStarsLayer = {
  points: THREE.Points;
  baseColors: Float32Array;
  phases: Float32Array;
  speeds: Float32Array;
  depths: Float32Array;
  update(elapsed: number): void;
  dispose(): void;
};

export function createBackgroundStarsLayer(texture: THREE.Texture): BackgroundStarsLayer {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const baseColors = new Float32Array(STAR_COUNT * 3);
  const phases = new Float32Array(STAR_COUNT);
  const speeds = new Float32Array(STAR_COUNT);
  const depths = new Float32Array(STAR_COUNT);

  for (let i = 0; i < STAR_COUNT; i++) {
    const ix = i * 3;
    const seed = i + 1;
    const depth = hashUnit(seed, 0);
    const radius = Math.sqrt(hashUnit(seed, 1)) * 1.85;
    const angle = hashUnit(seed, 2) * Math.PI * 2;

    positions[ix] = Math.cos(angle) * radius;
    positions[ix + 1] = Math.sin(angle) * radius * 0.62;
    positions[ix + 2] = -0.4 - depth * 2.8;

    depths[i] = depth;
    phases[i] = hashUnit(seed, 3) * Math.PI * 2;
    speeds[i] = 0.18 + hashUnit(seed, 4) * 0.55;

    const warmth = 0.82 + hashUnit(seed, 5) * 0.18;
    const brightness = 0.18 + hashUnit(seed, 6) * 0.62;
    baseColors[ix] = brightness * warmth;
    baseColors[ix + 1] = brightness * (0.9 + warmth * 0.08);
    baseColors[ix + 2] = brightness * (0.72 + warmth * 0.12);
    colors[ix] = baseColors[ix]!;
    colors[ix + 1] = baseColors[ix + 1]!;
    colors[ix + 2] = baseColors[ix + 2]!;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    map: texture,
    size: 0.009,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.92,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 0;

  return {
    points,
    baseColors,
    phases,
    speeds,
    depths,
    update(elapsed: number) {
      const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;

      for (let i = 0; i < STAR_COUNT; i++) {
        const ix = i * 3;
        const twinkle =
          0.62 +
          0.38 *
            Math.sin(elapsed * speeds[i]! + phases[i]!) *
            Math.sin(elapsed * speeds[i]! * 0.37 + phases[i]! * 1.7);
        const parallax = 1 + depths[i]! * 0.06 * Math.sin(elapsed * 0.08 + phases[i]!);

        colorAttr.array[ix] = baseColors[ix]! * twinkle * parallax;
        colorAttr.array[ix + 1] = baseColors[ix + 1]! * twinkle * parallax;
        colorAttr.array[ix + 2] = baseColors[ix + 2]! * twinkle * parallax;
      }

      colorAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
