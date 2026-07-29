import { describe, expect, test } from '@jest/globals';
import { getScenePreset, SCENE_PRESETS } from '../presets/scenePresets';
import { getServiceScene, listServiceSceneIds, SERVICE_SCENES } from '../registry';

describe('SERVICE_SCENES', () => {
  test('contains visual scene ids without page semantics', () => {
    expect(listServiceSceneIds().sort()).toEqual(
      ['404', 'broken-link', 'envelope', 'hexagon', 'rings', 'sphere'].sort()
    );
  });

  test('each entry exposes a createRenderer factory', () => {
    for (const id of listServiceSceneIds()) {
      const definition = getServiceScene(id);
      expect(definition.id).toBe(id);
      expect(typeof definition.createRenderer).toBe('function');
    }
  });

  test('registry lookup matches static map', () => {
    for (const id of listServiceSceneIds()) {
      expect(getServiceScene(id)).toBe(SERVICE_SCENES[id]);
    }
  });
});

describe('SCENE_PRESETS', () => {
  test('each preset defines shape, motion, and appearance', () => {
    for (const id of listServiceSceneIds()) {
      const preset = getScenePreset(id);
      expect(preset.shape).toBeTruthy();
      expect(preset.motion).toBeTruthy();
      expect(preset.appearance).toBeTruthy();
      expect(preset).toBe(SCENE_PRESETS[id]);
    }
  });
});
