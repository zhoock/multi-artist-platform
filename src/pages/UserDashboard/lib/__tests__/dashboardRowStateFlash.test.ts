import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import {
  DASHBOARD_ROW_FLASH_RGB_VAR,
  DASHBOARD_ROW_STATE_FLASH_CLASS,
  DASHBOARD_ROW_STATE_FLASH_DURATION_MS,
  getDashboardRowFlashProps,
  useDashboardRowFlash,
} from '../dashboardRowStateFlash';

describe('useDashboardRowFlash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('stores flash state by row id after deferral', () => {
    const { result } = renderHook(() => useDashboardRowFlash());

    act(() => {
      result.current.flashRow('dashboard-track-row-1', 'public');
    });

    expect(result.current.flashes['dashboard-track-row-1']).toBeUndefined();

    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(result.current.flashes['dashboard-track-row-1']).toMatchObject({
      visibility: 'public',
    });
  });

  it('clears flash after duration', () => {
    const { result } = renderHook(() => useDashboardRowFlash());

    act(() => {
      result.current.flashRow('dashboard-track-row-1', 'hidden');
      jest.advanceTimersByTime(0);
    });

    expect(result.current.flashes['dashboard-track-row-1']).toBeDefined();

    act(() => {
      jest.advanceTimersByTime(DASHBOARD_ROW_STATE_FLASH_DURATION_MS);
    });

    expect(result.current.flashes['dashboard-track-row-1']).toBeUndefined();
  });

  it('replaces visibility on repeated flashes', () => {
    const { result } = renderHook(() => useDashboardRowFlash());

    act(() => {
      result.current.flashRow('dashboard-track-row-1', 'public');
      jest.advanceTimersByTime(0);
    });

    act(() => {
      result.current.flashRow('dashboard-track-row-1', 'hidden');
      jest.advanceTimersByTime(0);
    });

    expect(result.current.flashes['dashboard-track-row-1']?.visibility).toBe('hidden');
  });
});

describe('getDashboardRowFlashProps', () => {
  it('returns flash class, rgb var, and data attribute', () => {
    const props = getDashboardRowFlashProps('dashboard-album-row-1', {
      'dashboard-album-row-1': { visibility: 'public', token: 1 },
    });

    expect(props.className).toBe(DASHBOARD_ROW_STATE_FLASH_CLASS);
    expect(props['data-visibility-flash']).toBe('public');
    expect(props.style?.[DASHBOARD_ROW_FLASH_RGB_VAR as keyof typeof props.style]).toBe(
      '125 206 160'
    );
  });

  it('returns empty props when row is not flashing', () => {
    expect(getDashboardRowFlashProps('dashboard-album-row-1', {})).toEqual({});
  });
});
