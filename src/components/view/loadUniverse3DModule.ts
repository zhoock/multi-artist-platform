type Universe3DModule = typeof import('./Universe3D');

let universe3DModulePromise: Promise<Universe3DModule> | null = null;

export function loadUniverse3DModule(): Promise<Universe3DModule> {
  if (!universe3DModulePromise) {
    universe3DModulePromise = import(
      /* webpackChunkName: "universe3d-bootstrap" */
      './universe3DAsyncLoader'
    ).then((m) => m.loadUniverse3DModuleImpl());
  }
  return universe3DModulePromise;
}
