import type { AlbumDetails } from '@entities/album/model/albumDetails';

/** Minimal commerce shape used by album-page purchase / stream UI. */
export type AlbumCommerceSource = Pick<
  AlbumDetails,
  'userId' | 'albumId' | 'dbAlbumId' | 'purchase' | 'serviceButtons' | 'tracks' | 'title'
>;

/** Signed-in viewer owns this album (artist dashboard context, not customer purchase). */
export function isAlbumViewerOwner(
  album: { userId?: string } | undefined,
  viewerUserId: string | null | undefined
): boolean {
  const ownerId = album?.userId?.trim();
  const viewerId = viewerUserId?.trim();
  return Boolean(ownerId && viewerId && ownerId === viewerId);
}

export function getAllowDownloadSaleValue(album: AlbumCommerceSource): string {
  const fromPurchase = album.purchase?.allowDownloadSale;
  if (typeof fromPurchase === 'string' && fromPurchase.trim()) {
    return fromPurchase;
  }
  return 'no';
}

/** Альбом помечен как платная продажа/предзаказ (настройка в release / purchase). */
export function isAlbumPaidSaleEnabled(album: AlbumCommerceSource): boolean {
  const v = getAllowDownloadSaleValue(album);
  return v === 'yes' || v === 'preorder';
}

export function hasTruthyButtonUrl(
  buttons: Record<string, string> | undefined,
  keys: readonly string[]
): boolean {
  return keys.some((key) => Boolean(buttons?.[key]?.trim()));
}

/** Есть ли что показать в блоке «Купить»: скачивание/продажа или хотя бы одна ссылка. */
export function hasAlbumPurchaseSectionContent(album: AlbumCommerceSource): boolean {
  const buttons = album.serviceButtons;
  const isDownloadAllowed = isAlbumPaidSaleEnabled(album);
  const hasPurchaseLinks = hasTruthyButtonUrl(buttons, ['itunes', 'bandcamp', 'amazon']);
  return isDownloadAllowed || hasPurchaseLinks;
}

/** Есть ли что показать в блоке «Слушать»: хотя бы одна стриминговая ссылка. */
export function hasAlbumStreamSectionContent(album: AlbumCommerceSource): boolean {
  return hasTruthyButtonUrl(album.serviceButtons, [
    'apple',
    'vk',
    'youtube',
    'spotify',
    'yandex',
    'deezer',
    'tidal',
  ]);
}
