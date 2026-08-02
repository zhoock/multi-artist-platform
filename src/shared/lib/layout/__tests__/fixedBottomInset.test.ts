import { beforeEach, describe, expect, test } from '@jest/globals';

import {
  LAYOUT_FIXED_BOTTOM_INSET_VAR,
  clearFixedBottomInset,
  measureFixedElementBottomInset,
  setFixedBottomInset,
} from '../fixedBottomInset';

describe('fixedBottomInset', () => {
  beforeEach(() => {
    clearFixedBottomInset();
  });

  test('sets and clears the shared CSS custom property on :root', () => {
    setFixedBottomInset(72);

    expect(document.documentElement.style.getPropertyValue(LAYOUT_FIXED_BOTTOM_INSET_VAR)).toBe(
      '72px'
    );

    clearFixedBottomInset();

    expect(document.documentElement.style.getPropertyValue(LAYOUT_FIXED_BOTTOM_INSET_VAR)).toBe('');
  });

  test('measureFixedElementBottomInset includes block size and bottom offset', () => {
    const element = document.createElement('div');
    element.style.position = 'fixed';
    element.style.bottom = '12px';
    Object.defineProperty(element, 'offsetHeight', {
      configurable: true,
      value: 64,
    });
    document.body.appendChild(element);

    expect(measureFixedElementBottomInset(element)).toBe(76);

    element.remove();
  });
});
