/**
 * Guards against applying stale remote stem loads after local mutations.
 */

export function shouldApplyRemoteStemsLoad(params: {
  currentLoadGeneration: number;
  expectedLoadGeneration: number;
  localRevisionAtLoadStart: number;
  currentLocalRevision: number;
}): boolean {
  if (params.currentLoadGeneration !== params.expectedLoadGeneration) {
    return false;
  }
  if (params.currentLocalRevision > params.localRevisionAtLoadStart) {
    return false;
  }
  return true;
}
