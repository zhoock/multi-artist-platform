import { useEffect, useState } from 'react';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { getYooKassaShopId } from '@shared/api/payment';
import { getAlbumKeyForPaymentApis } from '@shared/lib/payment/albumPaymentKey';
import {
  type AlbumCommerceSource,
  hasAlbumPurchaseSectionContent,
  hasTruthyButtonUrl,
  isAlbumPaidSaleEnabled,
  isAlbumViewerOwner,
} from './albumPurchaseUtils';

type YookassaState = { status: 'loading' | 'done'; available: boolean };

/**
 * Продавец альбома с активной ЮKassa в БД (без shop ID кнопка «скачать» не показывается).
 */
export function useYooKassaShopAvailableForAlbum(album: AlbumCommerceSource, enabled: boolean) {
  const [state, setState] = useState<YookassaState>(() =>
    enabled ? { status: 'loading', available: false } : { status: 'done', available: false }
  );

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'done', available: false });
      return;
    }
    const paymentKey = getAlbumKeyForPaymentApis(album);
    if (!paymentKey) {
      setState({ status: 'done', available: false });
      return;
    }

    setState({ status: 'loading', available: false });
    let cancelled = false;

    void getYooKassaShopId(paymentKey).then(({ shopId }) => {
      if (!cancelled) {
        setState({ status: 'done', available: Boolean(shopId) });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, album.albumId, album.dbAlbumId]);

  return {
    loading: state.status === 'loading',
    available: state.available,
  };
}

/**
 * Показывать ли блок «Купить» на странице альбома: если включена только продажа скачивания,
 * блок есть только при настроенной ЮKassa у продавца.
 */
export function useShowAlbumPurchaseSection(
  album: AlbumCommerceSource | undefined
): boolean | null {
  const viewer = useAuthSessionUser();
  const isAlbumOwnerView = isAlbumViewerOwner(album, viewer?.id);
  const buttons = album?.serviceButtons;
  const isDownloadAllowed = album ? isAlbumPaidSaleEnabled(album) : false;
  const hasPurchaseLinks = hasTruthyButtonUrl(buttons, ['itunes', 'bandcamp', 'amazon']);
  const emptyAlbum = {
    albumId: '',
    title: '',
    userId: '',
    dbAlbumId: '',
    purchase: { allowDownloadSale: '', regularPrice: '0.99', currency: 'RUB' },
    serviceButtons: {},
    tracks: [],
  } satisfies AlbumCommerceSource;
  const { loading, available } = useYooKassaShopAvailableForAlbum(
    album ?? emptyAlbum,
    Boolean(album && isDownloadAllowed && !isAlbumOwnerView)
  );

  if (!album) {
    return false;
  }
  if (!hasAlbumPurchaseSectionContent(album)) {
    return false;
  }
  if (hasPurchaseLinks) {
    return true;
  }
  if (isAlbumOwnerView) {
    return false;
  }
  if (loading) {
    return null;
  }
  return available;
}
