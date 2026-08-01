import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';

import { armAccountDeletedToast } from '../armAccountDeletedToast';
import { armPurchaseSuccessToast } from '../armPurchaseSuccessToast';
import {
  getPendingPurchaseSuccessReturnPath,
  resetPendingPurchaseSuccessToastForTests,
  tryConsumePendingPurchaseSuccessToast,
} from '../pendingPurchaseSuccessToast';
import { toast } from '../toastApi';
import { ToastProvider } from '../ToastProvider';
import { resetNavigationToastPersistenceForTests } from '../toastNavigationPersistence';
import { resetToastStoreForTests } from '../toastStore';
import { NavigationToastHydrator } from '../useHydrateNavigationToasts';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' as const }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: () => undefined,
}));

function renderNavigationHydrator() {
  return render(
    <ToastProvider>
      <NavigationToastHydrator />
    </ToastProvider>
  );
}

describe('NavigationToastHydrator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    resetNavigationToastPersistenceForTests();
    resetPendingPurchaseSuccessToastForTests();
    resetToastStoreForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('hydrates account-deleted intent into toast.show()', () => {
    armAccountDeletedToast();

    renderNavigationHydrator();

    expect(screen.getByRole('status')).toHaveTextContent('Account deleted');
    expect(screen.getByRole('status')).toHaveTextContent('Account data is no longer available.');
  });

  test('stores purchase-success intent as pending without rendering toast', () => {
    armPurchaseSuccessToast('/albums/rubber-soul?artist=beatles');

    renderNavigationHydrator();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(getPendingPurchaseSuccessReturnPath()).toBe('/albums/rubber-soul?artist=beatles');
  });

  test('tryConsumePendingPurchaseSuccessToast matches path one-shot', () => {
    armPurchaseSuccessToast('/albums/rubber-soul?artist=beatles');

    renderNavigationHydrator();

    expect(tryConsumePendingPurchaseSuccessToast('/albums/other?artist=beatles')).toBe(false);
    expect(getPendingPurchaseSuccessReturnPath()).toBe('/albums/rubber-soul?artist=beatles');

    expect(tryConsumePendingPurchaseSuccessToast('/albums/rubber-soul?artist=beatles')).toBe(true);
    expect(getPendingPurchaseSuccessReturnPath()).toBeNull();
  });

  test('does nothing when no navigation intent is stored', () => {
    renderNavigationHydrator();

    act(() => {
      toast.show({ title: 'Unrelated toast' });
    });

    expect(screen.getByText('Unrelated toast')).toBeInTheDocument();
    expect(getPendingPurchaseSuccessReturnPath()).toBeNull();
  });
});

describe('pendingPurchaseSuccessToast', () => {
  beforeEach(() => {
    resetPendingPurchaseSuccessToastForTests();
  });

  test('tryConsumePendingPurchaseSuccessToast returns false when pending is empty', () => {
    expect(tryConsumePendingPurchaseSuccessToast('/albums/test')).toBe(false);
  });
});
