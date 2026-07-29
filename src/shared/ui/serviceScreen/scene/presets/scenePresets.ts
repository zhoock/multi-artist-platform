import type { AppearanceId } from '../appearance';
import { getAppearance } from '../appearance';
import { createMatterEngine } from '../matter/MatterEngine';
import type { MatterQuality } from '../matter/particleQuality';
import { getMotionProfile, type MotionId } from '../motion';
import { createShape } from '../shapes/registry';
import type { ShapeId } from '../shapes/types';
import type { ServiceRendererHandle, ServiceSceneId } from '../types';

export type ScenePreset = {
  shape: ShapeId;
  motion: MotionId;
  appearance: AppearanceId;
};

/** Ready-made artistic presets — Matter + Shape + Motion + Appearance. */
export const SCENE_PRESETS: Record<ServiceSceneId, ScenePreset> = {
  envelope: { shape: 'envelope', motion: 'assemble', appearance: 'ambient' },
  'broken-link': { shape: 'broken-link', motion: 'drift', appearance: 'ambient' },
  '404': { shape: '404', motion: 'assemble', appearance: 'ambient' },
  hexagon: { shape: 'hexagon', motion: 'pulse', appearance: 'ambient' },
  sphere: { shape: 'sphere', motion: 'pulse', appearance: 'ambient' },
  rings: { shape: 'rings', motion: 'drift', appearance: 'ambient' },
};

export function getScenePreset(id: ServiceSceneId): ScenePreset {
  return SCENE_PRESETS[id];
}

export function createSceneFromPreset(
  preset: ScenePreset,
  quality: MatterQuality = 'medium'
): ServiceRendererHandle {
  const shape = createShape(preset.shape);

  return createMatterEngine({
    shape,
    motion: getMotionProfile(preset.motion),
    appearance: getAppearance(preset.appearance),
    quality,
  });
}

export function createSceneById(
  id: ServiceSceneId,
  quality: MatterQuality = 'medium'
): ServiceRendererHandle {
  return createSceneFromPreset(getScenePreset(id), quality);
}
