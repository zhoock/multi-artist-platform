import {
  QUALIFIED_PLAY_WALL_CLOCK_GRACE_SECONDS,
  computeQualifiedPlayAccumulationDelta,
} from '@features/player/model/lib/qualifiedPlayAccumulation';

describe('computeQualifiedPlayAccumulationDelta', () => {
  const base = {
    lastCurrentTime: 10,
    lastWallMs: 1000,
    nowMs: 6000,
    playbackRate: 1,
    canAccumulate: true,
  };

  test('counts small steady playback steps', () => {
    const result = computeQualifiedPlayAccumulationDelta({
      ...base,
      currentTime: 10.2,
      lastCurrentTime: 10,
      lastWallMs: 1000,
      nowMs: 1200,
    });
    expect(result.deltaToAdd).toBeCloseTo(0.2, 5);
  });

  test('background tab: large media delta aligned with wall time is counted', () => {
    const result = computeQualifiedPlayAccumulationDelta({
      ...base,
      currentTime: 14.5,
      lastCurrentTime: 10,
      lastWallMs: 1000,
      nowMs: 5500,
    });
    expect(result.deltaToAdd).toBeCloseTo(4.5, 5);
  });

  test('buffering / waiting: does not accumulate', () => {
    const result = computeQualifiedPlayAccumulationDelta({
      ...base,
      currentTime: 15,
      canAccumulate: false,
    });
    expect(result.deltaToAdd).toBe(0);
  });

  test('pause: does not accumulate', () => {
    const result = computeQualifiedPlayAccumulationDelta({
      ...base,
      currentTime: 12,
      canAccumulate: false,
    });
    expect(result.deltaToAdd).toBe(0);
  });

  test('seek forward: large jump without wall time is ignored', () => {
    const result = computeQualifiedPlayAccumulationDelta({
      ...base,
      currentTime: 120,
      lastCurrentTime: 10,
      lastWallMs: 1000,
      nowMs: 1100,
    });
    expect(result.deltaToAdd).toBe(0);
  });

  test('seek backward: negative media delta is ignored', () => {
    const result = computeQualifiedPlayAccumulationDelta({
      ...base,
      currentTime: 5,
      lastCurrentTime: 10,
      lastWallMs: 1000,
      nowMs: 2000,
    });
    expect(result.deltaToAdd).toBe(0);
  });

  test('playbackRate scales allowed wall progress', () => {
    const result = computeQualifiedPlayAccumulationDelta({
      ...base,
      currentTime: 18,
      lastCurrentTime: 10,
      lastWallMs: 1000,
      nowMs: 5000,
      playbackRate: 2,
    });
    expect(result.deltaToAdd).toBeCloseTo(8, 5);
  });

  test('first sample after session start does not add time', () => {
    const result = computeQualifiedPlayAccumulationDelta({
      ...base,
      currentTime: 1,
      lastCurrentTime: 0,
      lastWallMs: 1000,
      nowMs: 2000,
    });
    expect(result.deltaToAdd).toBe(0);
  });

  test('grace constant is reasonable for throttled timeupdate', () => {
    expect(QUALIFIED_PLAY_WALL_CLOCK_GRACE_SECONDS).toBeGreaterThan(0);
  });
});
