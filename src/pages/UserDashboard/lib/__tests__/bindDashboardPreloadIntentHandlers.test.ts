import { describe, expect, it } from '@jest/globals';

import { bindDashboardPreloadIntentHandlers } from '../bindDashboardPreloadIntentHandlers';

describe('bindDashboardPreloadIntentHandlers', () => {
  it('returns empty object when preload callback is omitted', () => {
    expect(bindDashboardPreloadIntentHandlers()).toEqual({});
    expect(bindDashboardPreloadIntentHandlers(undefined)).toEqual({});
  });

  it('wires mouse enter and focus to the preload callback', () => {
    let calls = 0;
    const handlers = bindDashboardPreloadIntentHandlers(() => {
      calls += 1;
    });

    handlers.onMouseEnter?.();
    handlers.onFocus?.();

    expect(calls).toBe(2);
  });
});
