import { describe, expect, jest, test } from '@jest/globals';

/** Documents that Universe init uses single rAF, not legacy idle-after-cover gate. */
describe('hero canvas init scheduling latency (synthetic)', () => {
  test('legacy idle gate adds large delay vs single rAF', async () => {
    jest.useFakeTimers();
    const idleDelayMs = 400;
    let legacyDoneAt = -1;
    let newDoneAt = -1;
    const t0 = performance.now();

    window.requestIdleCallback = ((cb: IdleRequestCallback) => {
      return window.setTimeout(
        () => cb({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline),
        idleDelayMs
      );
    }) as typeof window.requestIdleCallback;

    const legacy = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestIdleCallback(() => {
            legacyDoneAt = performance.now() - t0;
          });
        });
      });
    };

    const modern = () => {
      requestAnimationFrame(() => {
        newDoneAt = performance.now() - t0;
      });
    };

    legacy();
    modern();

    jest.runAllTimers();
    // Fake timers: rAF runs sync in Jest; idle adds idleDelayMs on legacy path only.
    expect(newDoneAt).toBeGreaterThanOrEqual(0);
    expect(legacyDoneAt).toBeGreaterThanOrEqual(idleDelayMs);
    expect(legacyDoneAt - newDoneAt).toBeGreaterThanOrEqual(idleDelayMs - 5);

    jest.useRealTimers();
  });
});
