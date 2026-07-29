import type { ServiceRendererHandle } from '../../types';
import { createBrokenLinkConstellationRenderer } from './constellation/createConstellationRenderer';

/**
 * Broken-link scene — constellation stage.
 * D-shaped matter blobs (brokenLinkShape) kept as code placeholder, not mounted.
 */
export function createBrokenLinkRenderer(): ServiceRendererHandle {
  return createBrokenLinkConstellationRenderer({ mode: 'loop' });
}

/** Constellation birth — stars assemble links once, then rest in calm state. */
export function createConstellationBirthRenderer(): ServiceRendererHandle {
  return createBrokenLinkConstellationRenderer({ mode: 'birth' });
}
