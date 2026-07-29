import { describe, expect, test } from '@jest/globals';
import {
  ANIMATED_LINKS,
  BIRTH_SEQUENCE_S,
  computeConstellationBirthCycle,
} from '../constellationCycle';

describe('computeConstellationBirthCycle', () => {
  test('phase 1 — stars scattered like expired, no links', () => {
    const state = computeConstellationBirthCycle(0.5);

    expect(state.mode).toBe('birth');
    expect(state.breakAmount).toBe(1);
    expect(state.calm).toBe(false);

    const left = state.animatedPositions.get('s00')!;
    const right = state.animatedPositions.get('s07')!;
    expect(left.x).toBeLessThan(-0.5);
    expect(right.x).toBeGreaterThan(0.65);

    for (let i = 0; i < ANIMATED_LINKS.length; i++) {
      expect(state.linkDrawProgress[i]).toBe(0);
      expect(state.linkStrength[i]).toBe(0);
    }
  });

  test('phase 2 — early convergence, no links yet', () => {
    const state = computeConstellationBirthCycle(2.5);

    expect(state.isRestoring).toBe(true);
    expect(state.breakAmount).toBeGreaterThan(0);
    expect(state.breakAmount).toBeLessThan(1);

    for (let i = 0; i < ANIMATED_LINKS.length; i++) {
      expect(state.linkDrawProgress[i]).toBe(0);
    }
  });

  test('phase 3 — lines start mid-convergence while stars still move', () => {
    const beforeDraw = computeConstellationBirthCycle(3);
    const midConvergeDraw = computeConstellationBirthCycle(3.5);

    expect(beforeDraw.linkDrawProgress[0]).toBe(0);
    expect(midConvergeDraw.linkDrawProgress[0]).toBeGreaterThan(0);
    expect(midConvergeDraw.breakAmount).toBeGreaterThan(0);
    expect(midConvergeDraw.breakAmount).toBeLessThan(1);
  });

  test('phase 4 — links draw progressively, bridge last', () => {
    const midDraw = computeConstellationBirthCycle(4.5);
    const drawn = midDraw.linkDrawProgress.filter((p) => p >= 1).length;

    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(ANIMATED_LINKS.length);
    expect(midDraw.linkDrawProgress[10]).toBeLessThan(1);
  });

  test('phase 5 — bridge closes after draw window', () => {
    const atClose = computeConstellationBirthCycle(6.05);

    for (let i = 0; i < ANIMATED_LINKS.length; i++) {
      expect(atClose.linkDrawProgress[i]).toBe(1);
      expect(atClose.linkStrength[i]).toBe(1);
    }
  });

  test('phase 6 — energy wave active during wave window', () => {
    const beforeWave = computeConstellationBirthCycle(6);
    const duringWave = computeConstellationBirthCycle(6.8);
    const afterWave = computeConstellationBirthCycle(BIRTH_SEQUENCE_S + 0.5);

    const waveSum = (arr: Float32Array) => arr.reduce((a, b) => a + b, 0);

    expect(waveSum(beforeWave.linkWaveBoost)).toBe(0);
    expect(waveSum(duringWave.linkWaveBoost)).toBeGreaterThan(0);
    expect(duringWave.nodeGlowBoost.size).toBeGreaterThan(0);
    expect(waveSum(afterWave.linkWaveBoost)).toBe(0);
  });

  test('phase 7 — calm assembled state, no loop', () => {
    const calm = computeConstellationBirthCycle(BIRTH_SEQUENCE_S + 10);

    expect(calm.calm).toBe(true);
    expect(calm.breakAmount).toBe(0);

    for (let i = 0; i < ANIMATED_LINKS.length; i++) {
      expect(calm.linkDrawProgress[i]).toBe(1);
    }
  });
});
