import { UNIVERSE_SCENE_OVERLAY_ATTR } from './constants';

/**
 * Elements that sit above Universe3D and must receive pointer/wheel events without
 * triggering scene pan, zoom, or artist activation.
 */
const UNIVERSE_SCENE_OVERLAY_SELECTOR = [
  `[${UNIVERSE_SCENE_OVERLAY_ATTR}]`,
  '.universe3d-card',
  'dialog.popup[open]',
].join(', ');

export function isUniverseSceneOverlayTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(UNIVERSE_SCENE_OVERLAY_SELECTOR) !== null;
}
