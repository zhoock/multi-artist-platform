/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { renderHook } from '@testing-library/react';

import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from '../renewalCountdown';
import {
  RENEWAL_BILLING_REFRESH_INTERVAL_MS,
  shouldEnableRenewalBillingSync,
  useRenewalBillingSync,
} from '../useRenewalBillingRefresh';

describe('shouldEnableRenewalBillingSync', () => {
  test('stays enabled when access lapsed but auto-renew is waiting on scheduler', () => {
    expect(
      shouldEnableRenewalBillingSync({
        active: true,
        autoRenewEnabled: true,
        nextChargeAt: '2026-08-07T12:05:00.000Z',
      })
    ).toBe(true);
  });

  test('does not poll on inactive tab or without next charge', () => {
    expect(
      shouldEnableRenewalBillingSync({
        active: false,
        autoRenewEnabled: true,
        nextChargeAt: '2026-08-07T12:05:00.000Z',
      })
    ).toBe(false);
    expect(
      shouldEnableRenewalBillingSync({
        active: true,
        autoRenewEnabled: true,
        nextChargeAt: null,
      })
    ).toBe(false);
  });
});

describe('useRenewalBillingSync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-07T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does not poll before nextChargeAt', () => {
    const onRefresh = jest.fn<() => void>();
    const nextChargeAt = new Date('2026-08-07T12:05:00.000Z').toISOString();

    renderHook(() =>
      useRenewalBillingSync({
        enabled: true,
        nextChargeAt,
        onRefresh,
      })
    );

    jest.advanceTimersByTime(4 * 60 * 1000);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  test('starts polling at nextChargeAt and stops after the poll window', () => {
    const onRefresh = jest.fn<() => void>();
    const nextChargeAt = new Date('2026-08-07T12:05:00.000Z').toISOString();

    renderHook(() =>
      useRenewalBillingSync({
        enabled: true,
        nextChargeAt,
        onRefresh,
      })
    );

    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(RENEWAL_BILLING_REFRESH_INTERVAL_MS);
    expect(onRefresh.mock.calls.length).toBeGreaterThanOrEqual(2);

    const callsBeforeWindowEnd = onRefresh.mock.calls.length;
    jest.advanceTimersByTime(RENEWAL_OVERDUE_IN_PROGRESS_MS);
    expect(onRefresh.mock.calls.length).toBeGreaterThan(callsBeforeWindowEnd);

    const callsAfterWindow = onRefresh.mock.calls.length;
    jest.advanceTimersByTime(60 * 1000);
    expect(onRefresh).toHaveBeenCalledTimes(callsAfterWindow);
  });

  test('stops polling when nextChargeAt moves to the next period', () => {
    const onRefresh = jest.fn<() => void>();
    const initialChargeAt = new Date('2026-08-07T12:05:00.000Z').toISOString();
    const renewedChargeAt = new Date('2026-08-07T12:10:00.000Z').toISOString();

    const { rerender } = renderHook(
      ({ chargeAt }: { chargeAt: string }) =>
        useRenewalBillingSync({
          enabled: true,
          nextChargeAt: chargeAt,
          onRefresh,
        }),
      { initialProps: { chargeAt: initialChargeAt } }
    );

    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender({ chargeAt: renewedChargeAt });

    const callsAfterRenew = onRefresh.mock.calls.length;
    jest.advanceTimersByTime(RENEWAL_BILLING_REFRESH_INTERVAL_MS * 5);
    expect(onRefresh).toHaveBeenCalledTimes(callsAfterRenew);
  });

  test('does not poll when charge time is outside the renewal window', () => {
    const onRefresh = jest.fn<() => void>();
    const nextChargeAt = new Date('2026-08-07T11:50:00.000Z').toISOString();

    renderHook(() =>
      useRenewalBillingSync({
        enabled: true,
        nextChargeAt,
        onRefresh,
      })
    );

    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  test('does not poll when disabled', () => {
    const onRefresh = jest.fn<() => void>();
    const nextChargeAt = new Date('2026-08-07T12:00:00.000Z').toISOString();

    renderHook(() =>
      useRenewalBillingSync({
        enabled: false,
        nextChargeAt,
        onRefresh,
      })
    );

    jest.advanceTimersByTime(RENEWAL_OVERDUE_IN_PROGRESS_MS);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  test('clears the previous poll window when nextChargeAt advances (no second interval)', () => {
    const onRefresh = jest.fn<() => void>();
    const periodMs = 5 * 60 * 1000;
    let chargeAt = new Date('2026-08-07T12:05:00.000Z').toISOString();

    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    const { rerender } = renderHook(
      ({ nextChargeAt }: { nextChargeAt: string }) =>
        useRenewalBillingSync({
          enabled: true,
          nextChargeAt,
          onRefresh,
        }),
      { initialProps: { nextChargeAt: chargeAt } }
    );

    jest.advanceTimersByTime(periodMs);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    const intervalsBeforeRenew = setIntervalSpy.mock.calls.length;
    chargeAt = new Date(new Date(chargeAt).getTime() + periodMs).toISOString();
    rerender({ nextChargeAt: chargeAt });

    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(intervalsBeforeRenew);

    const callsAfterRenew = onRefresh.mock.calls.length;
    jest.advanceTimersByTime(RENEWAL_BILLING_REFRESH_INTERVAL_MS * 3);
    expect(onRefresh).toHaveBeenCalledTimes(callsAfterRenew);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  test('does not accumulate timers across 10 sequential renewals', () => {
    const onRefresh = jest.fn<() => void>();
    const periodMs = 5 * 60 * 1000;
    let chargeAt = new Date('2026-08-07T12:05:00.000Z').toISOString();

    const { rerender, unmount } = renderHook(
      ({ nextChargeAt, enabled }: { nextChargeAt: string; enabled: boolean }) =>
        useRenewalBillingSync({
          enabled,
          nextChargeAt,
          onRefresh,
        }),
      { initialProps: { nextChargeAt: chargeAt, enabled: true } }
    );

    for (let cycle = 0; cycle < 10; cycle += 1) {
      jest.advanceTimersByTime(periodMs);
      chargeAt = new Date(new Date(chargeAt).getTime() + periodMs).toISOString();
      rerender({ nextChargeAt: chargeAt, enabled: true });
    }

    expect(jest.getTimerCount()).toBeLessThanOrEqual(2);

    const callsBeforeClose = onRefresh.mock.calls.length;
    rerender({ nextChargeAt: chargeAt, enabled: false });
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(onRefresh).toHaveBeenCalledTimes(callsBeforeClose);

    unmount();
    const callsBeforeUnmount = onRefresh.mock.calls.length;
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(onRefresh).toHaveBeenCalledTimes(callsBeforeUnmount);
  });

  test('stops all polling when enabled becomes false (collection tab closed)', () => {
    const onRefresh = jest.fn<() => void>();
    const nextChargeAt = new Date('2026-08-07T12:05:00.000Z').toISOString();

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useRenewalBillingSync({
          enabled,
          nextChargeAt,
          onRefresh,
        }),
      { initialProps: { enabled: true } }
    );

    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    const callsBeforeClose = onRefresh.mock.calls.length;
    rerender({ enabled: false });

    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(onRefresh).toHaveBeenCalledTimes(callsBeforeClose);
    expect(jest.getTimerCount()).toBe(0);
  });
});
