import type { AlbumCommerceSource } from './albumPurchaseUtils';

/** Album checkout is RUB-only (YooKassa); display always matches server pricing. */
export const ALBUM_PRICE_CURRENCY = 'RUB' as const;

export type AlbumPriceInfo = {
  price: string;
  currency: typeof ALBUM_PRICE_CURRENCY;
  formatted: string;
};

export function getAlbumPrice(album: AlbumCommerceSource): AlbumPriceInfo {
  const regularPrice = album.purchase?.regularPrice || '0.99';
  const priceNum = parseFloat(regularPrice) || 0;
  const formattedPrice = priceNum.toFixed(2);

  return {
    price: regularPrice,
    currency: ALBUM_PRICE_CURRENCY,
    formatted: `${formattedPrice} ₽`,
  };
}
