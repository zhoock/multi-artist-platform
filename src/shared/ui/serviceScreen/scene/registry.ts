import { createBrokenLinkRenderer } from './shapes/brokenLink/createBrokenLinkRenderer';
import { createSceneById } from './presets/scenePresets';
import type { ServiceSceneDefinition, ServiceSceneId } from './types';

/** Runtime registry — pages pick a scene id, presets define the visual language. */
export const SERVICE_SCENES: Record<ServiceSceneId, ServiceSceneDefinition> = {
  'broken-link': {
    id: 'broken-link',
    createRenderer: createBrokenLinkRenderer,
  },
  envelope: {
    id: 'envelope',
    createRenderer: () => createSceneById('envelope'),
  },
  '404': {
    id: '404',
    createRenderer: () => createSceneById('404'),
  },
  sphere: {
    id: 'sphere',
    createRenderer: () => createSceneById('sphere'),
  },
  rings: {
    id: 'rings',
    createRenderer: () => createSceneById('rings'),
  },
  hexagon: {
    id: 'hexagon',
    createRenderer: () => createSceneById('hexagon'),
  },
};

export function getServiceScene(id: ServiceSceneId): ServiceSceneDefinition {
  return SERVICE_SCENES[id];
}

export function listServiceSceneIds(): ServiceSceneId[] {
  return Object.keys(SERVICE_SCENES) as ServiceSceneId[];
}
