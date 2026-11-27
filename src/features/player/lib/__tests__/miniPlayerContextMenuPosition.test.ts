import { describe, expect, test } from '@jest/globals';

import {
  buildMiniPlayerContextMenuStyle,
  clampMiniPlayerContextMenuLeft,
  MINI_PLAYER_CONTEXT_MENU_GAP_PX,
} from '../miniPlayerContextMenuPosition';

describe('miniPlayerContextMenuPosition', () => {
  test('clampMiniPlayerContextMenuLeft keeps menu inside viewport', () => {
    expect(clampMiniPlayerContextMenuLeft(400, 200, 500, 8)).toBe(292);
    expect(clampMiniPlayerContextMenuLeft(0, 200, 500, 8)).toBe(8);
    expect(clampMiniPlayerContextMenuLeft(100, 200, 500, 8)).toBe(100);
  });

  test('buildMiniPlayerContextMenuStyle places menu above trigger with gap', () => {
    const style = buildMiniPlayerContextMenuStyle(
      { left: 200, top: 640, bottom: 688, width: 48 },
      { width: 240, height: 220 },
      { width: 1024, height: 800 },
      { placement: 'above', gap: MINI_PLAYER_CONTEXT_MENU_GAP_PX }
    );
    expect(style.left).toBe(104);
    expect(style.bottom).toBe(`calc(100vh - 640px + ${MINI_PLAYER_CONTEXT_MENU_GAP_PX}px)`);
    expect(style.top).toBe('auto');
    expect(style).not.toHaveProperty('minWidth');
  });

  test('buildMiniPlayerContextMenuStyle shifts left when menu would overflow', () => {
    const style = buildMiniPlayerContextMenuStyle(
      { left: 900, top: 640, bottom: 688, width: 48 },
      { width: 280, height: 220 },
      { width: 1024, height: 800 },
      { placement: 'above', gap: MINI_PLAYER_CONTEXT_MENU_GAP_PX }
    );
    expect(style.left).toBe(736);
  });
});
