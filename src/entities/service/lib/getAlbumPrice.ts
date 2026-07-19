import type { AlbumCommerceSource } from './albumPurchaseUtils';

export type AlbumPriceInfo = {
  price: string;
  currency: string;
  formatted: string;
};

export function getAlbumPrice(album: AlbumCommerceSource): AlbumPriceInfo {
  const regularPrice = album.purchase?.regularPrice || '0.99';
  const currency = album.purchase?.currency || 'USD';

  const priceNum = parseFloat(regularPrice) || 0;
  const formattedPrice = priceNum.toFixed(2);

  let formatted = '';
  switch (currency.toUpperCase()) {
    case 'RUB':
      formatted = `${formattedPrice} ₽`;
      break;
    case 'EUR':
      formatted = `€${formattedPrice}`;
      break;
    case 'USD':
      formatted = `$${formattedPrice}`;
      break;
    default:
      formatted = `${currency.toUpperCase()}${formattedPrice}`;
  }

  return {
    price: regularPrice,
    currency,
    formatted,
  };
}
