import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  computeDashboardAccessMenuPosition,
  resolveDashboardAccessMenuPortalFromElement,
  useDashboardAccessMenu,
} from '../useDashboardAccessMenu';

function mockToggleEvent(): ReactMouseEvent {
  return {
    stopPropagation: () => undefined,
    preventDefault: () => undefined,
  } as ReactMouseEvent;
}

describe('resolveDashboardAccessMenuPortalFromElement', () => {
  it('returns document.body when anchor is null', () => {
    expect(resolveDashboardAccessMenuPortalFromElement(null)).toBe(document.body);
  });

  it('prefers .user-dashboard inside dialog when requested', () => {
    const dialog = document.createElement('dialog');
    const dashboard = document.createElement('div');
    dashboard.className = 'user-dashboard';
    dialog.appendChild(dashboard);
    document.body.appendChild(dialog);

    expect(
      resolveDashboardAccessMenuPortalFromElement(dashboard, { preferUserDashboard: true })
    ).toBe(dashboard);

    document.body.removeChild(dialog);
  });
});

describe('computeDashboardAccessMenuPosition', () => {
  it('returns fallback position when trigger is null', () => {
    expect(computeDashboardAccessMenuPosition(null)).toEqual({ top: 120, left: 24 });
  });
});

describe('useDashboardAccessMenu', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('supports controlled open state', () => {
    const onOpenChange = jest.fn();

    const { result, rerender } = renderHook(
      ({ open }) =>
        useDashboardAccessMenu({
          open,
          onOpenChange,
          getPortalRoot: (_trigger) => document.body,
        }),
      { initialProps: { open: false } }
    );

    act(() => {
      result.current.toggleMenu(mockToggleEvent());
    });

    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender({ open: true });
    expect(result.current.menuOpen).toBe(true);
  });

  it('supports uncontrolled open state', () => {
    const { result } = renderHook(() =>
      useDashboardAccessMenu({
        getPortalRoot: (_trigger) => document.body,
      })
    );

    act(() => {
      result.current.toggleMenu(mockToggleEvent());
    });

    expect(result.current.menuOpen).toBe(true);

    act(() => {
      result.current.closeMenu();
    });

    expect(result.current.menuOpen).toBe(false);
  });

  it('closes on Escape', () => {
    const { result } = renderHook(() =>
      useDashboardAccessMenu({
        getPortalRoot: (_trigger) => document.body,
      })
    );

    act(() => {
      result.current.toggleMenu(mockToggleEvent());
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.menuOpen).toBe(false);
  });

  it('closes on outside mousedown after deferral', () => {
    const { result } = renderHook(() =>
      useDashboardAccessMenu({
        getPortalRoot: (_trigger) => document.body,
      })
    );

    act(() => {
      result.current.toggleMenu(mockToggleEvent());
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(result.current.menuOpen).toBe(false);
  });

  it('passes trigger element to getPortalRoot', () => {
    const getPortalRoot = jest.fn((_trigger: HTMLElement | null) => document.body);

    renderHook(() =>
      useDashboardAccessMenu({
        getPortalRoot,
      })
    );

    expect(getPortalRoot).toHaveBeenCalledWith(null);
  });
});
