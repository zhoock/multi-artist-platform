/** Shared qualified listen threshold (mirrors server). */

export function getQualifiedListenThresholdSeconds(trackDurationSeconds: number): number {
  if (!Number.isFinite(trackDurationSeconds) || trackDurationSeconds <= 0) {
    return 30;
  }
  if (trackDurationSeconds < 30) {
    return trackDurationSeconds * 0.5;
  }
  return 30;
}

export function isQualifiedListenDuration(
  durationListenedSeconds: number,
  trackDurationSeconds: number
): boolean {
  if (!Number.isFinite(durationListenedSeconds) || durationListenedSeconds <= 0) {
    return false;
  }
  return durationListenedSeconds >= getQualifiedListenThresholdSeconds(trackDurationSeconds);
}
