import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';

import {
  ARTIST_AUDIENCE_POLL_INTERVAL_MS,
  ARTIST_AUDIENCE_REFRESH_DEBOUNCE_MS,
  useArtistAudienceLiveRefresh,
} from '../useArtistAudienceLiveRefresh';

describe('useArtistAudienceLiveRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not poll when disabled', () => {
    const onRefresh = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    renderHook(() =>
      useArtistAudienceLiveRefresh({
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
      useArtistAudienceLiveRefresh({
        enabled: true,
        onRefresh,
        pollIntervalMs: ARTIST_AUDIENCE_POLL_INTERVAL_MS,
        debounceMs: ARTIST_AUDIENCE_REFRESH_DEBOUNCE_MS,
      })
    );

    act(() => {
      jest.advanceTimersByTime(ARTIST_AUDIENCE_POLL_INTERVAL_MS);
    });
    await act(async () => {
      jest.advanceTimersByTime(ARTIST_AUDIENCE_REFRESH_DEBOUNCE_MS);
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
      useArtistAudienceLiveRefresh({
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
      useArtistAudienceLiveRefresh({
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
});
