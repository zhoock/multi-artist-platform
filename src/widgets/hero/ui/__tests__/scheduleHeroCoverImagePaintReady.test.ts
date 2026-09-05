import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { scheduleHeroCoverImagePaintReady } from '../scheduleHeroCoverImagePaintReady';

describe('scheduleHeroCoverImagePaintReady', () => {
  let rafQueue: FrameRequestCallback[];
  let rafId: number;

  beforeEach(() => {
    rafQueue = [];
    rafId = 0;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      rafId += 1;
      return rafId;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  function flushRaf(count = 1) {
    for (let i = 0; i < count; i += 1) {
      const batch = rafQueue.splice(0, rafQueue.length);
      batch.forEach((cb) => cb(0));
    }
  }

  test('waits for load, decode, then two rAF frames before callback', async () => {
    const decode = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const img = {
      complete: false,
      naturalWidth: 0,
      decode,
      addEventListener: jest.fn((event: string, listener: EventListener) => {
        if (event === 'load') {
          queueMicrotask(() => {
            (img as { complete: boolean; naturalWidth: number }).complete = true;
            (img as { naturalWidth: number }).naturalWidth = 1920;
            listener(new Event('load'));
          });
        }
      }),
    } as unknown as HTMLImageElement;

    const onReady = jest.fn();
    scheduleHeroCoverImagePaintReady(img, onReady);

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    await Promise.resolve();
    expect(onReady).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledTimes(1);

    flushRaf(1);
    expect(onReady).not.toHaveBeenCalled();

    flushRaf(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test('skips load wait when img is already complete', async () => {
    const decode = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const img = {
      complete: true,
      naturalWidth: 1920,
      decode,
      addEventListener: jest.fn(),
    } as unknown as HTMLImageElement;

    const onReady = jest.fn();
    scheduleHeroCoverImagePaintReady(img, onReady);

    await Promise.resolve();
    expect(img.addEventListener).not.toHaveBeenCalled();
    expect(decode).toHaveBeenCalledTimes(1);

    flushRaf(2);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test('cleanup prevents callback after unmount', async () => {
    const decode = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const img = {
      complete: true,
      naturalWidth: 1920,
      decode,
      addEventListener: jest.fn(),
    } as unknown as HTMLImageElement;

    const onReady = jest.fn();
    const cancel = scheduleHeroCoverImagePaintReady(img, onReady);

    cancel();
    await Promise.resolve();
    flushRaf(2);

    expect(onReady).not.toHaveBeenCalled();
  });
});
