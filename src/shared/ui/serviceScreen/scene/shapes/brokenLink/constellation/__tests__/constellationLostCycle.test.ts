import { describe, expect, test } from '@jest/globals';
import { ANIMATED_LINKS } from '../constellationCycle';
import {
  computeConstellationLostCycle,
  countVisibleLostLinks,
  isLostConstellationIncomplete,
  LOST_ATTEMPT_S,
  LOST_STATIC_ELAPSED,
  sampleAttempt,
} from '../constellationLostCycle';

describe('computeConstellationLostCycle', () => {
  test('mode is lost with no separation or particles', () => {
    const state = computeConstellationLostCycle(5);

    expect(state.mode).toBe('lost');
    expect(state.breakAmount).toBe(0);
    expect(state.isRestoring).toBe(false);

    for (let i = 0; i < state.particleDrive.length; i++) {
      expect(state.particleDrive[i]).toBe(0);
    }
  });

  test('stars stay near base positions with subtle drift only', () => {
    const state = computeConstellationLostCycle(12);

    const s00 = state.animatedPositions.get('s00')!;
    expect(Math.abs(s00.x - -0.64)).toBeLessThan(0.02);
    expect(Math.abs(s00.y - 0.44)).toBeLessThan(0.02);
  });

  test('links generally accumulate before peak despite mid-chain rejections', () => {
    const early = countVisibleLostLinks(computeConstellationLostCycle(LOST_ATTEMPT_S * 0.12));
    const mid = countVisibleLostLinks(computeConstellationLostCycle(LOST_ATTEMPT_S * 0.55));

    expect(mid).toBeGreaterThan(early);
  });

  test('interior chain links can be rejected leaving visible gaps', () => {
    let foundGap = false;

    for (let p = 0.1; p <= 0.58; p += 0.015) {
      const state = computeConstellationLostCycle(p * LOST_ATTEMPT_S);

      const leftGap =
        state.linkStrength[1]! > 0.15 &&
        state.linkStrength[3]! > 0.15 &&
        state.linkStrength[2]! < 0.08;
      const rightGap =
        state.linkStrength[6]! > 0.15 &&
        state.linkStrength[8]! > 0.15 &&
        state.linkStrength[7]! < 0.08;

      if (leftGap || rightGap) {
        foundGap = true;
        break;
      }
    }

    expect(foundGap).toBe(true);
  });

  test('peak phase shows many links but never all arcs complete', () => {
    const state = computeConstellationLostCycle(LOST_ATTEMPT_S * 0.68);
    const visible = countVisibleLostLinks(state);

    expect(visible).toBeGreaterThanOrEqual(5);
    expect(visible).toBeLessThan(ANIMATED_LINKS.length);
    expect(isLostConstellationIncomplete(state)).toBe(true);
  });

  test('dissolve clears links before next attempt', () => {
    const endOfAttempt = computeConstellationLostCycle(LOST_ATTEMPT_S * 0.99);
    expect(countVisibleLostLinks(endOfAttempt)).toBe(0);

    const startOfNext = computeConstellationLostCycle(LOST_ATTEMPT_S * 1.02);
    expect(countVisibleLostLinks(startOfNext)).toBeLessThanOrEqual(1);
  });

  test('never fully assembles across multiple attempts', () => {
    for (let t = 0; t < LOST_ATTEMPT_S * 8; t += 0.2) {
      const state = computeConstellationLostCycle(t);
      expect(isLostConstellationIncomplete(state)).toBe(true);
    }
  });

  test('bridge never fully draws even on tease routes', () => {
    for (let t = 0; t < LOST_ATTEMPT_S * 6; t += 0.2) {
      const state = computeConstellationLostCycle(t);
      expect(state.linkDrawProgress[10]).toBeLessThan(0.4);
    }
  });

  test('earlier links fade before later ones during dissolve', () => {
    const dissolveT = LOST_ATTEMPT_S * 0.82;
    const state = computeConstellationLostCycle(dissolveT);

    expect(state.linkStrength[0]!).toBeLessThan(state.linkStrength[9]!);
  });

  test('static snapshot for reduced motion shows mid-search pattern', () => {
    const state = computeConstellationLostCycle(LOST_STATIC_ELAPSED);
    const visible = countVisibleLostLinks(state);

    expect(visible).toBeGreaterThanOrEqual(4);
    expect(visible).toBeLessThan(ANIMATED_LINKS.length);
    expect(isLostConstellationIncomplete(state)).toBe(true);
  });

  test('no wave glow effects', () => {
    const state = computeConstellationLostCycle(8);

    expect(state.linkWaveBoost.every((v) => v === 0)).toBe(true);
    expect(state.nodeGlowBoost.size).toBe(0);
  });

  test('attempt routes rotate over time', () => {
    const first = sampleAttempt(LOST_ATTEMPT_S * 0.3);
    const second = sampleAttempt(LOST_ATTEMPT_S * 1.3);

    expect(first.routeIndex).not.toBe(second.routeIndex);
  });
});
