import { armPurchaseSuccessToast } from '@shared/lib/toast/armPurchaseSuccessToast';
import {
  resetPendingPurchaseSuccessToastForTests,
  setPendingPurchaseSuccessReturnPath,
  tryConsumePendingPurchaseSuccessToast,
} from '@shared/lib/toast/pendingPurchaseSuccessToast';
import { consumeNavigationToastIntent } from '@shared/lib/toast/toastNavigationPersistence';
import { normalizeAlbumReturnPath } from '../albumPurchaseSuccessToast';

describe('albumPurchaseSuccessToast', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPendingPurchaseSuccessToastForTests();
  });

  test('normalizeAlbumReturnPath preserves pathname, search, and hash', () => {
    expect(normalizeAlbumReturnPath('/albums/rubber-soul?artist=beatles')).toBe(
      '/albums/rubber-soul?artist=beatles'
    );
    expect(normalizeAlbumReturnPath('/albums/rubber-soul?artist=beatles#tracks')).toBe(
      '/albums/rubber-soul?artist=beatles#tracks'
    );
  });

  test('tryConsume removes flag only for matching return path', () => {
    setPendingPurchaseSuccessReturnPath('/albums/rubber-soul?artist=beatles');

    expect(tryConsumePendingPurchaseSuccessToast('/albums/other?artist=beatles')).toBe(false);

    expect(tryConsumePendingPurchaseSuccessToast('/albums/rubber-soul?artist=beatles')).toBe(true);
  });

  test('second consume after successful show returns false', () => {
    setPendingPurchaseSuccessReturnPath('/albums/rubber-soul?artist=beatles');

    expect(tryConsumePendingPurchaseSuccessToast('/albums/rubber-soul?artist=beatles')).toBe(true);
    expect(tryConsumePendingPurchaseSuccessToast('/albums/rubber-soul?artist=beatles')).toBe(false);
  });

  test('armPurchaseSuccessToast hydrates pending path via navigation intent', () => {
    armPurchaseSuccessToast('/albums/rubber-soul?artist=beatles');

    const intent = consumeNavigationToastIntent();
    expect(intent).toEqual({
      kind: 'purchase-success',
      returnPath: '/albums/rubber-soul?artist=beatles',
    });
  });
});
