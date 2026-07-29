export type {
  ServiceRendererFactory,
  ServiceRendererHandle,
  ServiceSceneDefinition,
  ServiceSceneId,
} from './types';
export { getServiceScene, listServiceSceneIds, SERVICE_SCENES } from './registry';
export { ServiceSceneProvider, useServiceScene } from './ServiceSceneContext';
export { ServiceSceneEngine, useServiceSceneEngine } from './engine';
export type { ScenePreset } from './presets/scenePresets';
export {
  createSceneById,
  createSceneFromPreset,
  getScenePreset,
  SCENE_PRESETS,
} from './presets/scenePresets';
export type { ShapeBounds, ShapeDefinition, ShapeFactory, ShapeId, Vec3 } from './shapes/types';
export { createShape, getShapeFactory, SHAPES } from './shapes/registry';
export type { MotionId, MotionProfile } from './motion';
export { getMotionProfile, MOTION_PROFILES } from './motion';
export type { AppearanceId, AppearanceProfile } from './appearance';
export { APPEARANCE_PRESETS, getAppearance } from './appearance';
export { createMatterEngine, MatterEngine } from './matter/MatterEngine';
export type { MatterConfig } from './matter/matterBehavior';
export type { MatterQuality } from './matter/particleQuality';
export {
  MATTER_PARTICLE_COUNTS,
  resolveParticleCount,
  sampleContourToParticles,
} from './matter/particleQuality';
