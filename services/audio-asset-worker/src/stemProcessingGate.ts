const inFlightMasterPaths = new Set<string>();

export function beginStemProcessingJob(masterPath: string): boolean {
  const key = masterPath.trim();
  if (!key || inFlightMasterPaths.has(key)) {
    return false;
  }
  inFlightMasterPaths.add(key);
  return true;
}

export function finishStemProcessingJob(masterPath: string): void {
  inFlightMasterPaths.delete(masterPath.trim());
}

export function resetStemProcessingGateForTests(): void {
  inFlightMasterPaths.clear();
}
