import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';

import {
  USER_NOTIFICATIONS_LIVE_POLL_MS,
  USER_NOTIFICATIONS_LIVE_REFRESH_DEBOUNCE_MS,
  useUserNotificationsLiveRefresh,
} from '../useUserNotificationsLiveRefresh';

describe('useUserNotificationsLiveRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not poll when disabled', () => {
    const onRefresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    renderHook(() =>
      useUserNotificationsLiveRefresh({
        enabled: false,
        onRefresh,
        pollIntervalMs: 1_000,
        debounceMs: 100,
      })
    );

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('polls on interval with debounce when enabled', async () => {
    const onRefresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    renderHook(() =>
      useUserNotificationsLiveRefresh({
        enabled: true,
        onRefresh,
        pollIntervalMs: USER_NOTIFICATIONS_LIVE_POLL_MS,
        debounceMs: USER_NOTIFICATIONS_LIVE_REFRESH_DEBOUNCE_MS,
      })
    );

    act(() => {
      jest.advanceTimersByTime(USER_NOTIFICATIONS_LIVE_POLL_MS);
    });
    await act(async () => {
      jest.advanceTimersByTime(USER_NOTIFICATIONS_LIVE_REFRESH_DEBOUNCE_MS);
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('coalesces overlapping refresh requests', async () => {
    let resolveFirst: (() => void) | undefined;
    const onRefresh = jest
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue(undefined);

    renderHook(() =>
      useUserNotificationsLiveRefresh({
        enabled: true,
        onRefresh,
        pollIntervalMs: 10_000,
        debounceMs: 50,
      })
    );

    act(() => {
      jest.advanceTimersByTime(10_000);
      jest.advanceTimersByTime(50);
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      jest.advanceTimersByTime(10_000);
      jest.advanceTimersByTime(50);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst?.();
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('schedules refresh when tab becomes visible', async () => {
    const onRefresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    renderHook(() =>
      useUserNotificationsLiveRefresh({
        enabled: true,
        onRefresh,
        pollIntervalMs: 60_000,
        debounceMs: 100,
      })
    );

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('uses faster live interval constant suitable for open notifications UI', () => {
    expect(USER_NOTIFICATIONS_LIVE_POLL_MS).toBeLessThanOrEqual(5_000);
  });
});
