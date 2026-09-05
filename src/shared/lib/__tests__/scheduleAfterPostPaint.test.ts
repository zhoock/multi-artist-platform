import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { scheduleAfterPostPaint } from '../scheduleAfterPostPaint';

describe('scheduleAfterPostPaint', () => {
  let rafQueue: FrameRequestCallback[];
  let rafId: number;
  let idleCallbacks: IdleRequestCallback[];
  let originalRequestIdleCallback: typeof window.requestIdleCallback | undefined;

  beforeEach(() => {
    rafQueue = [];
    rafId = 0;
    idleCallbacks = [];
    originalRequestIdleCallback = window.requestIdleCallback;

    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      rafId += 1;
      return rafId;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    window.requestIdleCallback = jest.fn((cb: IdleRequestCallback) => {
      idleCallbacks.push(cb);
      return 1;
    }) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = jest.fn();
  });

  afterEach(() => {
    if (originalRequestIdleCallback !== undefined) {
      window.requestIdleCallback = originalRequestIdleCallback;
    } else {
      Reflect.deleteProperty(window, 'requestIdleCallback');
    }
  });

  function flushRaf(count = 1) {
    for (let i = 0; i < count; i += 1) {
      const batch = rafQueue.splice(0, rafQueue.length);
      batch.forEach((cb) => cb(0));
    }
  }

  function flushIdle() {
    idleCallbacks
      .splice(0, idleCallbacks.length)
      .forEach((cb) => cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline));
  }

  test('runs callback after two rAF frames and requestIdleCallback', () => {
    const onReady = jest.fn();
    scheduleAfterPostPaint(onReady);

    flushRaf(1);
    expect(onReady).not.toHaveBeenCalled();

    flushRaf(1);
    expect(onReady).not.toHaveBeenCalled();

    flushIdle();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test('falls back to setTimeout when requestIdleCallback is unavailable', () => {
    // @ts-expect-error test override
    window.requestIdleCallback = undefined;
    const setTimeoutSpy = jest.spyOn(window, 'setTimeout');

    const onReady = jest.fn();
    scheduleAfterPostPaint(onReady);

    flushRaf(2);
    expect(onReady).not.toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalledWith(onReady, 150);

    setTimeoutSpy.mockRestore();
  });

  test('cleanup prevents callback after unmount', () => {
    const onReady = jest.fn();
    const cancel = scheduleAfterPostPaint(onReady);

    cancel();
    flushRaf(2);
    flushIdle();

    expect(onReady).not.toHaveBeenCalled();
  });
});
