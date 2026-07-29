/** How matter behaves — field, breath, intro. Shape-agnostic. */
export type MatterConfig = {
  breathPeriodS: number;
  breathAmplitude: number;
  fieldAmplitude: number;
  fieldSpeed: number;
  introMs: number;
  particleIntroMs: number;
  driftAmplitude?: number;
  driftPeriodS?: number;
  stretchAmplitude?: number;
  breakZoneWidth?: number;
  breakZoneHeight?: number;
  breakZoneDispersion?: number;
  breakZoneCycleS?: number;
};

export const DEFAULT_MATTER_CONFIG: MatterConfig = {
  breathPeriodS: 10,
  breathAmplitude: 0.024,
  fieldAmplitude: 0.0016,
  fieldSpeed: 0.11,
  introMs: 2800,
  particleIntroMs: 1800,
};

export type MatterFieldSample = {
  dx: number;
  dy: number;
  dz: number;
};

/** Coherent field — one living organism, not independent particles. */
export function sampleCoherentField(
  x: number,
  y: number,
  phase: number,
  amplitude: number
): MatterFieldSample {
  const field = Math.sin(x * 2.8 + phase) * Math.cos(y * 2.4 + phase * 0.85) * amplitude;

  return {
    dx: field,
    dy: field * 0.7,
    dz: field * 0.35,
  };
}

export function computeBreathScale(elapsedS: number, periodS: number, amplitude: number): number {
  return 1 + Math.sin((elapsedS * Math.PI * 2) / periodS) * amplitude;
}

export function computeHorizontalDrift(
  elapsedS: number,
  periodS: number,
  amplitude: number
): number {
  return Math.sin((elapsedS * Math.PI * 2) / periodS) * amplitude;
}

export function computeStretchScale(
  elapsedS: number,
  periodS: number,
  amplitude: number,
  phaseOffset = Math.PI * 0.25
): number {
  return 1 + Math.sin((elapsedS * Math.PI * 2) / periodS + phaseOffset) * amplitude;
}

export function computeBreakZonePhase(elapsedS: number, periodS: number): number {
  return Math.sin((elapsedS * Math.PI * 2) / periodS);
}

export function isInsideBreakZone(x: number, y: number, width: number, height: number): boolean {
  return Math.abs(x) < width && Math.abs(y) < height;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function computeIntroStagger(targets: Float32Array): Float32Array {
  const count = targets.length / 3;
  const stagger = new Float32Array(count);
  let maxDist = 0;

  for (let i = 0; i < count; i++) {
    const dist = Math.hypot(targets[i * 3], targets[i * 3 + 1]);
    maxDist = Math.max(maxDist, dist);
  }

  for (let i = 0; i < count; i++) {
    const dist = Math.hypot(targets[i * 3], targets[i * 3 + 1]);
    stagger[i] = maxDist === 0 ? 0 : (dist / maxDist) * 0.85;
  }

  return stagger;
}

export function generateScatterOrigin(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const tau = Math.PI * 2;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * tau;
    const radius = 0.55 + Math.random() * 0.95;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.sin(angle) * radius * 0.85;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
  }

  return positions;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
