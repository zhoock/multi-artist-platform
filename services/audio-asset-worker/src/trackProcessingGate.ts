/**
 * Same-process guard so a second accept for a track does not start another job
 * while the first is still running. Cross-instance dedupe is the DB advisory lock.
 */
const inFlightTrackIds = new Set<string>();

export function beginTrackProcessingJob(trackDbId: string): boolean {
  if (inFlightTrackIds.has(trackDbId)) {
    return false;
  }
  inFlightTrackIds.add(trackDbId);
  return true;
}

export function finishTrackProcessingJob(trackDbId: string): void {
  inFlightTrackIds.delete(trackDbId);
}

export function resetTrackProcessingGateForTests(): void {
  inFlightTrackIds.clear();
}
