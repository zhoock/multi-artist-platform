import { describe, expect, test } from '@jest/globals';
import { applyNativeRangeFromClientX, nativeRangeValueFromClientX } from '../nativeRangePointer';

function fakeRange(overrides: Partial<HTMLInputElement> = {}): HTMLInputElement {
  const vars = new Map<string, string>();
  const el = {
    min: '0',
    max: '100',
    value: '50',
    style: {
      setProperty: (name: string, value: string) => {
        vars.set(name, value);
      },
      getPropertyValue: (name: string) => vars.get(name) ?? '',
    },
    getBoundingClientRect: () =>
      ({
        left: 0,
        right: 100,
        width: 100,
        top: 0,
        bottom: 8,
        height: 8,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
    ...overrides,
  };
  return el as HTMLInputElement;
}

describe('nativeRangeValueFromClientX', () => {
  test('maps tap position along the track, including edges', () => {
    const el = fakeRange();

    expect(nativeRangeValueFromClientX(el, 35)).toBe(35);
    expect(nativeRangeValueFromClientX(el, -10)).toBe(0);
    expect(nativeRangeValueFromClientX(el, 140)).toBe(100);
  });

  test('returns null when the track has no width', () => {
    const el = fakeRange({
      getBoundingClientRect: () =>
        ({
          left: 0,
          right: 0,
          width: 0,
          top: 0,
          bottom: 8,
          height: 8,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    expect(nativeRangeValueFromClientX(el, 50)).toBeNull();
  });
});

describe('applyNativeRangeFromClientX', () => {
  test('writes value and optional CSS variable', () => {
    const el = fakeRange();

    expect(applyNativeRangeFromClientX(el, 80, '--progress-width')).toBe(80);
    expect(el.value).toBe('80');
    expect(el.style.getPropertyValue('--progress-width')).toBe('80%');
  });
});
