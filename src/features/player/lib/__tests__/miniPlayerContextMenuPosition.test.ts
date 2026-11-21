import { describe, expect, test } from '@jest/globals';

import {
  buildMiniPlayerContextMenuStyle,
  clampMiniPlayerContextMenuLeft,
} from '../miniPlayerContextMenuPosition';

describe('miniPlayerContextMenuPosition', () => {
  test('clampMiniPlayerContextMenuLeft keeps menu inside viewport', () => {
    expect(clampMiniPlayerContextMenuLeft(400, 200, 500, 8)).toBe(292);
    expect(clampMiniPlayerContextMenuLeft(0, 200, 500, 8)).toBe(8);
    expect(clampMiniPlayerContextMenuLeft(100, 200, 500, 8)).toBe(100);
  });

  test('buildMiniPlayerContextMenuStyle tracks mini-player top edge', () => {
    const style = buildMiniPlayerContextMenuStyle(
      { left: 120, top: 640, bottom: 712, width: 280 },
      { width: 240, height: 220 },
      { width: 1024, height: 800 }
    );
    expect(style.left).toBe(120);
    expect(style.bottom).toBe('calc(100vh - 640px + var(--ms-01, 8px))');
    expect(style.minWidth).toBe(280);
  });

  test('buildMiniPlayerContextMenuStyle shifts left when menu would overflow', () => {
    const style = buildMiniPlayerContextMenuStyle(
      { left: 900, top: 640, bottom: 712, width: 200 },
      { width: 280, height: 220 },
      { width: 1024, height: 800 }
    );
    expect(style.left).toBe(736);
  });
});
