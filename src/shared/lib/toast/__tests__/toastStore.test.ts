import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  dismissAllToasts,
  dismissToast,
  getToasts,
  resetToastStoreForTests,
  showToast,
} from '../toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetToastStoreForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('showToast adds an in-memory toast with defaults', () => {
    const id = showToast({ title: 'Saved' });

    expect(id).toBe('toast-1');
    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0]).toMatchObject({
      id: 'toast-1',
      title: 'Saved',
      variant: 'success',
      placement: 'top-right',
      layer: 'default',
      duration: 4500,
      dismissible: false,
    });
  });

  test('dismissToast removes a toast by id', () => {
    const id = showToast({ title: 'One' });
    showToast({ title: 'Two' });

    dismissToast(id);

    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0]?.title).toBe('Two');
  });

  test('dismissAllToasts clears the store', () => {
    showToast({ title: 'One' });
    showToast({ title: 'Two' });

    dismissAllToasts();

    expect(getToasts()).toHaveLength(0);
  });

  test('auto-dismisses after duration elapses', () => {
    showToast({ title: 'Temporary', duration: 2000 });

    expect(getToasts()).toHaveLength(1);

    jest.advanceTimersByTime(1999);
    expect(getToasts()).toHaveLength(1);

    jest.advanceTimersByTime(1);
    expect(getToasts()).toHaveLength(0);
  });

  test('persistent toast does not schedule auto-dismiss', () => {
    showToast({ title: 'Persistent', duration: null, dismissible: true });

    jest.advanceTimersByTime(60_000);

    expect(getToasts()).toHaveLength(1);
  });
});
