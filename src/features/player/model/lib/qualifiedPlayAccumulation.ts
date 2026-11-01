/**
 * Pure helpers: accumulate listened time from audio currentTime advances only
 * while playback is actively progressing (not pause / seek / buffering).
 */

/** Small jumps between throttled timeupdate events (normal playback). */
export const QUALIFIED_PLAY_MAX_INSTANT_MEDIA_DELTA = 2.5;

/** Allow media to catch up to wall clock when timeupdate was throttled (background tab). */
export const QUALIFIED_PLAY_WALL_CLOCK_GRACE_SECONDS = 1.25;

export type QualifiedPlayAccumulationInput = {
  currentTime: number;
  lastCurrentTime: number;
  lastWallMs: number;
  nowMs: number;
  playbackRate: number;
  /** False during pause, waiting (buffering), or seeking. */
  canAccumulate: boolean;
};

export type QualifiedPlayAccumulationResult = {
  deltaToAdd: number;
  nextLastCurrentTime: number;
  nextLastWallMs: number;
};

function normalizePlaybackRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    return 1;
  }
  return rate;
}

/**
 * Adds listened seconds when currentTime moves forward in sync with elapsed wall time.
 * Rejects large currentTime jumps that are not explained by wall time (seek forward).
 */
export function computeQualifiedPlayAccumulationDelta(
  input: QualifiedPlayAccumulationInput
): QualifiedPlayAccumulationResult {
  const { currentTime, lastCurrentTime, lastWallMs, nowMs, canAccumulate } = input;
  const playbackRate = normalizePlaybackRate(input.playbackRate);

  if (!canAccumulate) {
    return {
      deltaToAdd: 0,
      nextLastCurrentTime: currentTime,
      nextLastWallMs: nowMs,
    };
  }

  if (!Number.isFinite(currentTime) || currentTime < 0) {
    return { deltaToAdd: 0, nextLastCurrentTime: lastCurrentTime, nextLastWallMs: nowMs };
  }

  if (lastCurrentTime <= 0) {
    return {
      deltaToAdd: 0,
      nextLastCurrentTime: currentTime,
      nextLastWallMs: nowMs,
    };
  }

  const mediaDelta = currentTime - lastCurrentTime;
  const wallSeconds = Math.max(0, (nowMs - lastWallMs) / 1000);
  const maxProgressByWall = wallSeconds * playbackRate + QUALIFIED_PLAY_WALL_CLOCK_GRACE_SECONDS;

  let deltaToAdd = 0;

  if (mediaDelta <= 0) {
    deltaToAdd = 0;
  } else if (mediaDelta <= QUALIFIED_PLAY_MAX_INSTANT_MEDIA_DELTA) {
    deltaToAdd = mediaDelta;
  } else if (mediaDelta <= maxProgressByWall) {
    deltaToAdd = mediaDelta;
  } else {
    deltaToAdd = 0;
  }

  return {
    deltaToAdd,
    nextLastCurrentTime: currentTime,
    nextLastWallMs: nowMs,
  };
}
