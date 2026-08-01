import { beforeEach, describe, expect, test } from '@jest/globals';

import { armAccountDeletedToast } from '../armAccountDeletedToast';
import { armPurchaseSuccessToast } from '../armPurchaseSuccessToast';
import {
  consumeNavigationToastIntent,
  resetNavigationToastPersistenceForTests,
  writeNavigationToastIntent,
} from '../toastNavigationPersistence';

const NAVIGATION_TOAST_INTENT_KEY = 'sc-toast-navigation-intent';

describe('toastNavigationPersistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetNavigationToastPersistenceForTests();
  });

  test('write and consume account-deleted intent', () => {
    writeNavigationToastIntent({ kind: 'account-deleted' });

    expect(consumeNavigationToastIntent()).toEqual({ kind: 'account-deleted' });
    expect(sessionStorage.getItem(NAVIGATION_TOAST_INTENT_KEY)).toBeNull();
  });

  test('write and consume purchase-success intent', () => {
    writeNavigationToastIntent({
      kind: 'purchase-success',
      returnPath: '/albums/rubber-soul?artist=beatles',
    });

    expect(consumeNavigationToastIntent()).toEqual({
      kind: 'purchase-success',
      returnPath: '/albums/rubber-soul?artist=beatles',
    });
  });

  test('consume is one-shot', () => {
    writeNavigationToastIntent({ kind: 'account-deleted' });

    expect(consumeNavigationToastIntent()).toEqual({ kind: 'account-deleted' });
    expect(consumeNavigationToastIntent()).toBeNull();
  });

  test('consume rejects invalid payload', () => {
    sessionStorage.setItem(NAVIGATION_TOAST_INTENT_KEY, JSON.stringify({ kind: 'unknown' }));

    expect(consumeNavigationToastIntent()).toBeNull();
  });
});

describe('arm* helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetNavigationToastPersistenceForTests();
  });

  test('armAccountDeletedToast writes account-deleted intent', () => {
    armAccountDeletedToast();

    expect(JSON.parse(sessionStorage.getItem(NAVIGATION_TOAST_INTENT_KEY)!)).toEqual({
      kind: 'account-deleted',
    });
  });

  test('armPurchaseSuccessToast normalizes and writes purchase-success intent', () => {
    armPurchaseSuccessToast('/albums/rubber-soul?artist=beatles#tracks');

    expect(JSON.parse(sessionStorage.getItem(NAVIGATION_TOAST_INTENT_KEY)!)).toEqual({
      kind: 'purchase-success',
      returnPath: '/albums/rubber-soul?artist=beatles#tracks',
    });
  });

  test('armPurchaseSuccessToast ignores unparseable return path', () => {
    armPurchaseSuccessToast('http://[invalid');

    expect(sessionStorage.getItem(NAVIGATION_TOAST_INTENT_KEY)).toBeNull();
  });
});
