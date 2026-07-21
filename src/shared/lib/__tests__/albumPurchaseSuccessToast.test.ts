import {
  ALBUM_PURCHASE_SUCCESS_TOAST_KEY,
  consumeAlbumPurchaseSuccessToast,
  normalizeAlbumReturnPath,
  queueAlbumPurchaseSuccessToast,
} from '../albumPurchaseSuccessToast';

describe('albumPurchaseSuccessToast', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('normalizeAlbumReturnPath preserves pathname, search, and hash', () => {
    expect(normalizeAlbumReturnPath('/albums/rubber-soul?artist=beatles')).toBe(
      '/albums/rubber-soul?artist=beatles'
    );
    expect(normalizeAlbumReturnPath('/albums/rubber-soul?artist=beatles#tracks')).toBe(
      '/albums/rubber-soul?artist=beatles#tracks'
    );
  });

  test('consume removes flag only for matching return path', () => {
    queueAlbumPurchaseSuccessToast('/albums/rubber-soul?artist=beatles');

    expect(consumeAlbumPurchaseSuccessToast('/albums/other?artist=beatles')).toBe(false);
    expect(sessionStorage.getItem(ALBUM_PURCHASE_SUCCESS_TOAST_KEY)).toBe(
      '/albums/rubber-soul?artist=beatles'
    );

    expect(consumeAlbumPurchaseSuccessToast('/albums/rubber-soul?artist=beatles')).toBe(true);
    expect(sessionStorage.getItem(ALBUM_PURCHASE_SUCCESS_TOAST_KEY)).toBeNull();
  });

  test('second consume after successful show returns false', () => {
    queueAlbumPurchaseSuccessToast('/albums/rubber-soul?artist=beatles');

    expect(consumeAlbumPurchaseSuccessToast('/albums/rubber-soul?artist=beatles')).toBe(true);
    expect(consumeAlbumPurchaseSuccessToast('/albums/rubber-soul?artist=beatles')).toBe(false);
  });
});
