type Universe3DModule = typeof import('./Universe3D');

/** Async-only entry: never sync-import this file (keeps three.js out of the main chunk graph). */
export function loadUniverse3DModuleImpl(): Promise<Universe3DModule> {
  return import(/* webpackChunkName: "universe3d" */ './Universe3D');
}
