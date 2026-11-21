import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react';

import {
  __getBodyScrollLockCountForTests,
  __resetBodyScrollLockForTests,
  useBodyScrollLock,
} from '../useBodyScrollLock';

describe('useBodyScrollLock', () => {
  let scrollToSpy: jest.SpiedFunction<typeof window.scrollTo>;

  beforeEach(() => {
    __resetBodyScrollLockForTests();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1024,
      configurable: true,
      writable: true,
    });
    scrollToSpy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    __resetBodyScrollLockForTests();
    scrollToSpy.mockRestore();
  });

  test('locks body when active=true and unlocks when active=false', () => {
    const { rerender } = renderHook(({ active }) => useBodyScrollLock(active), {
      initialProps: { active: false },
    });

    expect(document.body.style.overflow).toBe('');
    expect(__getBodyScrollLockCountForTests()).toBe(0);

    rerender({ active: true });
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(__getBodyScrollLockCountForTests()).toBe(1);

    rerender({ active: false });
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    expect(__getBodyScrollLockCountForTests()).toBe(0);
  });

  test('does not move the document with position fixed or scrollTo on unlock', () => {
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true, writable: true });

    const { rerender } = renderHook(({ active }) => useBodyScrollLock(active), {
      initialProps: { active: true },
    });

    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');

    rerender({ active: false });

    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
  });

  test('compensates scrollbar gap on desktop to prevent layout shift', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1009, // 15px scrollbar
      configurable: true,
      writable: true,
    });

    const { unmount } = renderHook(() => useBodyScrollLock(true));

    expect(document.body.style.paddingRight).toBe('15px');

    unmount();
    expect(document.body.style.paddingRight).toBe('');
  });

  test('refcounts nested locks: only the last unmount releases', () => {
    const { unmount: unmountA } = renderHook(() => useBodyScrollLock(true));
    const { unmount: unmountB } = renderHook(() => useBodyScrollLock(true));

    expect(__getBodyScrollLockCountForTests()).toBe(2);
    expect(document.body.style.overflow).toBe('hidden');

    unmountA();
    expect(__getBodyScrollLockCountForTests()).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');

    unmountB();
    expect(__getBodyScrollLockCountForTests()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  test('inactive hook does not affect body styles', () => {
    renderHook(() => useBodyScrollLock(false));
    expect(document.body.style.overflow).toBe('');
    expect(__getBodyScrollLockCountForTests()).toBe(0);
  });
});
