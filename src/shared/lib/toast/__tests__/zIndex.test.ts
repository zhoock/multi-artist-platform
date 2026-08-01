import { describe, expect, test } from '@jest/globals';

import { Z_INDEX } from '../zIndex';

describe('toast z-index constants', () => {
  test('uses centralized layering values', () => {
    expect(Z_INDEX.TOAST_VIEWPORT).toBe(10000);
    expect(Z_INDEX.TOAST_TOP_LAYER).toBe(10010);
  });

  test('toast viewport sits above modal overlay stacks', () => {
    expect(Z_INDEX.TOAST_VIEWPORT).toBeGreaterThan(1500);
  });

  test('toast top layer sits above viewport layer', () => {
    expect(Z_INDEX.TOAST_TOP_LAYER).toBeGreaterThan(Z_INDEX.TOAST_VIEWPORT);
  });
});
