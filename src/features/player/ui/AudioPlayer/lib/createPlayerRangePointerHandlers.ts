import type { ChangeEvent, PointerEventHandler } from 'react';
import {
  applyNativeRangeFromClientX,
  captureRangePointer,
  releaseRangePointer,
} from '@shared/lib/nativeRangePointer';

type RangeChangeHandler = (event: ChangeEvent<HTMLInputElement>) => void;

type PlayerRangePointerHandlers = {
  onPointerDown: PointerEventHandler<HTMLInputElement>;
  onPointerMove: PointerEventHandler<HTMLInputElement>;
  onPointerUp: PointerEventHandler<HTMLInputElement>;
  onPointerCancel: PointerEventHandler<HTMLInputElement>;
};

function emitRangeChange(el: HTMLInputElement, onChange: RangeChangeHandler) {
  onChange({
    target: el,
    currentTarget: el,
  } as ChangeEvent<HTMLInputElement>);
}

/** Pointer-capture handlers that map track taps/drags onto a native range. */
export function createPlayerRangePointerHandlers(
  cssVar: string,
  onChange: RangeChangeHandler,
  onEnd?: () => void
): PlayerRangePointerHandlers {
  const apply = (el: HTMLInputElement, clientX: number) => {
    const next = applyNativeRangeFromClientX(el, clientX, cssVar);
    if (next == null) return;
    emitRangeChange(el, onChange);
  };

  const onPointerDown: PointerEventHandler<HTMLInputElement> = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    captureRangePointer(event.currentTarget, event.pointerId);
    apply(event.currentTarget, event.clientX);
  };

  const onPointerMove: PointerEventHandler<HTMLInputElement> = (event) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    apply(event.currentTarget, event.clientX);
  };

  const onPointerEnd: PointerEventHandler<HTMLInputElement> = (event) => {
    releaseRangePointer(event.currentTarget, event.pointerId);
    onEnd?.();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
  };
}
