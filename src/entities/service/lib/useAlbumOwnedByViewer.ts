import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import {
  getMyPurchasesCached,
  getMyPurchasesCacheEpoch,
  subscribeMyPurchasesCache,
  type Purchase,
} from '@shared/api/purchases';
import { getAlbumKeyForPaymentApis } from '@shared/lib/payment/albumPaymentKey';
import {
  getAuthSessionIdentityKey,
  getUser,
  isAuthenticated,
  subscribeAuthSession,
} from '@shared/lib/auth';

function findOwnedPurchase(
  album: { dbAlbumId?: string },
  albumKey: string | undefined,
  purchases: Purchase[]
): Purchase | null {
  if (!albumKey) {
    return null;
  }

  const dbAlbumId = album.dbAlbumId?.trim();
  return (
    purchases.find(
      (purchase) => purchase.albumId === albumKey || (dbAlbumId && purchase.albumId === dbAlbumId)
    ) ?? null
  );
}

function isOwnershipCheckActive(
  enabled: boolean,
  albumKey: string | undefined,
  userId: string | undefined
): boolean {
  return Boolean(enabled && albumKey && userId && isAuthenticated());
}

/**
 * Whether the signed-in viewer owns this album (account library).
 *
 * Кэш покупок и его инвалидация живут в `@shared/api/purchases/cache.ts`,
 * чтобы `revokePurchase` мог сам сбрасывать кэш и страница артиста сразу
 * увидела, что альбом больше не куплен.
 */
export function useAlbumOwnedByViewer(
  album: { albumId?: string; dbAlbumId?: string },
  enabled: boolean
) {
  const albumKey = getAlbumKeyForPaymentApis(album);
  const sessionKey = useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionIdentityKey,
    () => ''
  );
  const purchasesCacheEpoch = useSyncExternalStore(
    subscribeMyPurchasesCache,
    getMyPurchasesCacheEpoch,
    () => 0
  );
  void sessionKey;

  const userId = getUser()?.id;
  const checkActive = isOwnershipCheckActive(enabled, albumKey, userId);
  const [isOwned, setIsOwned] = useState(false);
  const [ownedPurchase, setOwnedPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(checkActive);

  useLayoutEffect(() => {
    setLoading(checkActive);
  }, [checkActive]);

  useEffect(() => {
    if (!checkActive || !albumKey || !userId) {
      setIsOwned(false);
      setOwnedPurchase(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void getMyPurchasesCached(userId)
      .then((purchases) => {
        if (cancelled) {
          return;
        }
        const purchase = findOwnedPurchase(album, albumKey, purchases);
        setIsOwned(purchase !== null);
        setOwnedPurchase(purchase);
      })
      .catch(() => {
        if (!cancelled) {
          setIsOwned(false);
          setOwnedPurchase(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [album, albumKey, checkActive, userId, sessionKey, purchasesCacheEpoch]);

  return { isOwned, ownedPurchase, loading };
}
