import { describe, expect, test } from '@jest/globals';

import {
  measureMiniPlayerTitleOverflow,
  miniPlayerTitleMarqueeDurationSec,
  miniPlayerTitleMarqueeLoopDistancePx,
  MINI_PLAYER_TITLE_MARQUEE_GAP_PX,
} from '../miniPlayerTitleMarquee';

describe('measureMiniPlayerTitleOverflow', () => {
  test('returns 0 when lines fit the viewport', () => {
    expect(measureMiniPlayerTitleOverflow(200, [120, 180])).toBe(0);
  });

  test('returns overflow from the widest line', () => {
    expect(measureMiniPlayerTitleOverflow(100, [80, 142.2])).toBe(43);
  });

  test('returns 0 for empty lines or zero viewport', () => {
    expect(measureMiniPlayerTitleOverflow(0, [120])).toBe(0);
    expect(measureMiniPlayerTitleOverflow(100, [])).toBe(0);
  });
});

describe('miniPlayerTitleMarqueeLoopDistancePx', () => {
  test('adds a fixed gap between duplicated segments', () => {
    expect(miniPlayerTitleMarqueeLoopDistancePx(120)).toBe(120 + MINI_PLAYER_TITLE_MARQUEE_GAP_PX);
  });
});

describe('miniPlayerTitleMarqueeDurationSec', () => {
  test('grows with loop distance', () => {
    const loopDistance = miniPlayerTitleMarqueeLoopDistancePx(200);
    expect(miniPlayerTitleMarqueeDurationSec(loopDistance)).toBeGreaterThan(6);
  });
});
