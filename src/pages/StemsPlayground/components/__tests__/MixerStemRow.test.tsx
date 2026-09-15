import { describe, expect, test, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MixerStemRow } from '../MixerStemRow';

function renderRow(onVolumeChange = jest.fn<(volume: number) => void>()) {
  render(
    <MixerStemRow
      name="Vocals"
      category="vocal"
      volume={1}
      muted={false}
      soloed={false}
      soloLabel="Solo"
      muteLabel="Mute"
      onVolumeChange={onVolumeChange}
      onToggleMute={jest.fn()}
      onToggleSolo={jest.fn()}
    />
  );

  const slider = screen.getByRole('slider', { name: /Vocals/ }) as HTMLInputElement;
  const captured = new Set<number>();
  slider.setPointerCapture = (id: number) => {
    captured.add(id);
  };
  slider.releasePointerCapture = (id: number) => {
    captured.delete(id);
  };
  slider.hasPointerCapture = (id: number) => captured.has(id);
  slider.getBoundingClientRect = () =>
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

  return { slider, onVolumeChange, captured };
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

describe('MixerStemRow volume slider', () => {
  test('pointerdown on the track sets volume from the tap position', () => {
    const { slider, onVolumeChange } = renderRow();

    dispatchPointer(slider, 'pointerdown', 35);

    expect(onVolumeChange).toHaveBeenCalledWith(0.35);
  });

  test('pointermove while captured smoothly updates volume; pointerup releases capture', () => {
    const { slider, onVolumeChange, captured } = renderRow();

    dispatchPointer(slider, 'pointerdown', 20);
    dispatchPointer(slider, 'pointermove', 80);
    dispatchPointer(slider, 'pointerup', 80);

    expect(onVolumeChange.mock.calls.map((call) => call[0])).toEqual([0.2, 0.8]);
    expect(captured.size).toBe(0);
  });

  test('pointer at the left and right edges maps to 0% and 100%', () => {
    const { slider, onVolumeChange } = renderRow();

    dispatchPointer(slider, 'pointerdown', -10);
    dispatchPointer(slider, 'pointermove', 140);

    expect(onVolumeChange.mock.calls.map((call) => call[0])).toEqual([0, 1]);
  });
});
