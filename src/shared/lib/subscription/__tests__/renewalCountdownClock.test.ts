/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { renderHook } from '@testing-library/react';

import {
  getRenewalCountdownClockTickIntervalForTests,
  getRenewalCountdownTargetCountForTests,
  registerRenewalCountdownTarget,
  resetRenewalCountdownClockForTests,
  unregisterRenewalCountdownTarget,
} from '../renewalCountdownClock';
import { useRenewalCountdown } from '../useRenewalCountdown';

describe('renewalCountdownClock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetRenewalCountdownClockForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetRenewalCountdownClockForTests();
  });

  test('uses minute ticks unless a target is within the last minute', () => {
    const far = registerRenewalCountdownTarget(
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    );
    expect(getRenewalCountdownClockTickIntervalForTests()).toBe(60_000);
    unregisterRenewalCountdownTarget(far);

    registerRenewalCountdownTarget(new Date(Date.now() + 30 * 1000).toISOString());
    expect(getRenewalCountdownClockTickIntervalForTests()).toBe(1000);
  });

  test('tracks multiple targets with one shared registration set', () => {
    const first = registerRenewalCountdownTarget(
      new Date(Date.now() + 60 * 60 * 1000).toISOString()
    );
    const second = registerRenewalCountdownTarget(
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    );

    expect(getRenewalCountdownTargetCountForTests()).toBe(2);

    unregisterRenewalCountdownTarget(first);
    unregisterRenewalCountdownTarget(second);

    expect(getRenewalCountdownTargetCountForTests()).toBe(0);
  });
});

describe('useRenewalCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
    resetRenewalCountdownClockForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetRenewalCountdownClockForTests();
  });

  test('reuses one clock for multiple hook instances', () => {
    const nextChargeAt = new Date('2026-08-07T12:05:00.000Z').toISOString();

    const { unmount: unmountA } = renderHook(() => useRenewalCountdown(nextChargeAt, null, 'en'));
    const { unmount: unmountB } = renderHook(() => useRenewalCountdown(nextChargeAt, null, 'ru'));

    expect(getRenewalCountdownTargetCountForTests()).toBe(2);

    unmountA();
    expect(getRenewalCountdownTargetCountForTests()).toBe(1);

    unmountB();
    expect(getRenewalCountdownTargetCountForTests()).toBe(0);
  });

  test('falls back to expiresAt when nextChargeAt is absent', () => {
    const expiresAt = new Date('2026-09-03T00:00:00.000Z').toISOString();
    const { result } = renderHook(() => useRenewalCountdown(null, expiresAt, 'en'));

    expect(result.current.source).toBe('expiresAt');
    expect(result.current.label).toMatch(/2026/);
    expect(getRenewalCountdownTargetCountForTests()).toBe(0);
  });

  test('keeps a single countdown target when nextChargeAt advances across renewals', () => {
    const periodMs = 5 * 60 * 1000;
    let chargeAt = new Date('2026-08-07T12:05:00.000Z').toISOString();

    const { rerender, unmount } = renderHook(
      ({ nextChargeAt }: { nextChargeAt: string }) => useRenewalCountdown(nextChargeAt, null, 'en'),
      { initialProps: { nextChargeAt: chargeAt } }
    );

    expect(getRenewalCountdownTargetCountForTests()).toBe(1);

    for (let cycle = 0; cycle < 10; cycle += 1) {
      chargeAt = new Date(new Date(chargeAt).getTime() + periodMs).toISOString();
      rerender({ nextChargeAt: chargeAt });
      expect(getRenewalCountdownTargetCountForTests()).toBe(1);
    }

    unmount();
    expect(getRenewalCountdownTargetCountForTests()).toBe(0);
  });
});
