import type { ServiceRendererHandle } from '../../types';
import { createBrokenLinkConstellationRenderer } from './constellation/createConstellationRenderer';

/**
 * Broken-link scene — constellation stage.
 * D-shaped matter blobs (brokenLinkShape) kept as code placeholder, not mounted.
 */
export function createBrokenLinkRenderer(): ServiceRendererHandle {
  return createBrokenLinkConstellationRenderer();
}
