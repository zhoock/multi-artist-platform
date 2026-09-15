import { describe, expect, test, jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPlayerRangePointerHandlers } from '../createPlayerRangePointerHandlers';

function fakeRange() {
  const el = document.createElement('input');
  el.type = 'range';
  el.min = '0';
  el.max = '100';
  el.value = '50';
  const captured = new Set<number>();
  el.setPointerCapture = (id: number) => {
    captured.add(id);
  };
  el.releasePointerCapture = (id: number) => {
    captured.delete(id);
  };
  el.hasPointerCapture = (id: number) => captured.has(id);
  el.getBoundingClientRect = () =>
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
    }) as DOMRect;
  return { el, captured };
}

function dispatchPointer(
  el: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: 1,
    pointerType: 'touch',
    clientX,
    clientY: 4,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
  });
  fireEvent(el, event);
}

describe('createPlayerRangePointerHandlers', () => {
  test('pointerdown on the track sets value from the tap position', () => {
    const { el } = fakeRange();
    const onChange = jest.fn<(event: ChangeEvent<HTMLInputElement>) => void>();
    const handlers = createPlayerRangePointerHandlers('--progress-width', onChange);
    el.addEventListener('pointerdown', (event) =>
      handlers.onPointerDown(event as unknown as ReactPointerEvent<HTMLInputElement>)
    );

    dispatchPointer(el, 'pointerdown', 35);

    expect(el.value).toBe('35');
    expect(el.style.getPropertyValue('--progress-width')).toBe('35%');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target).toBe(el);
  });

  test('pointermove while captured smoothly updates value; pointerup releases capture', () => {
    const { el, captured } = fakeRange();
    const values: number[] = [];
    const onChange = jest.fn<(event: ChangeEvent<HTMLInputElement>) => void>((event) => {
      values.push(Number(event.target.value));
    });
    const onEnd = jest.fn();
    const handlers = createPlayerRangePointerHandlers('--volume-progress-width', onChange, onEnd);
    el.addEventListener('pointerdown', (event) =>
      handlers.onPointerDown(event as unknown as ReactPointerEvent<HTMLInputElement>)
    );
    el.addEventListener('pointermove', (event) =>
      handlers.onPointerMove(event as unknown as ReactPointerEvent<HTMLInputElement>)
    );
    el.addEventListener('pointerup', (event) =>
      handlers.onPointerUp(event as unknown as ReactPointerEvent<HTMLInputElement>)
    );

    dispatchPointer(el, 'pointerdown', 20);
    dispatchPointer(el, 'pointermove', 80);
    dispatchPointer(el, 'pointerup', 80);

    expect(values).toEqual([20, 80]);
    expect(captured.size).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test('pointer at the left and right edges maps to 0 and 100', () => {
    const { el } = fakeRange();
    const values: number[] = [];
    const onChange = jest.fn<(event: ChangeEvent<HTMLInputElement>) => void>((event) => {
      values.push(Number(event.target.value));
    });
    const handlers = createPlayerRangePointerHandlers('--progress-width', onChange);
    el.addEventListener('pointerdown', (event) =>
      handlers.onPointerDown(event as unknown as ReactPointerEvent<HTMLInputElement>)
    );
    el.addEventListener('pointermove', (event) =>
      handlers.onPointerMove(event as unknown as ReactPointerEvent<HTMLInputElement>)
    );

    dispatchPointer(el, 'pointerdown', -10);
    dispatchPointer(el, 'pointermove', 140);

    expect(values).toEqual([0, 100]);
  });
});
