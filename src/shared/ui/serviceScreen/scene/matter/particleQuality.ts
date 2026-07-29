export type MatterQuality = 'low' | 'medium' | 'ultra';

export const MATTER_PARTICLE_COUNTS: Record<MatterQuality, number> = {
  low: 1500,
  medium: 5000,
  ultra: 25000,
};

export function resolveParticleCount(quality: MatterQuality): number {
  return MATTER_PARTICLE_COUNTS[quality];
}

/** Resample geometric contour into render particles — quality lives in Matter. */
export function sampleContourToParticles(
  contour: Float32Array,
  particleCount: number
): Float32Array {
  const contourVertices = contour.length / 3;
  const particles = new Float32Array(particleCount * 3);

  if (contourVertices === 0) {
    return particles;
  }

  for (let i = 0; i < particleCount; i++) {
    const index = Math.floor(Math.random() * contourVertices);
    const next = (index + 1) % contourVertices;
    const t = Math.random();

    const ix = index * 3;
    const nx = next * 3;
    const jitter = 0.006;

    particles[i * 3] =
      contour[ix] + (contour[nx] - contour[ix]) * t + (Math.random() - 0.5) * jitter;
    particles[i * 3 + 1] =
      contour[ix + 1] + (contour[nx + 1] - contour[ix + 1]) * t + (Math.random() - 0.5) * jitter;
    particles[i * 3 + 2] =
      contour[ix + 2] +
      (contour[nx + 2] - contour[ix + 2]) * t +
      (Math.random() - 0.5) * jitter * 0.5;
  }

  return particles;
}
