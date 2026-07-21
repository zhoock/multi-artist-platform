/**
 * Кэш списка покупок текущего пользователя.
 *
 * Зачем: страница артиста через `useAlbumOwnedByViewer` многократно спрашивает,
 * куплен ли альбом. Чтобы не дёргать `/api/my-purchases` на каждый альбом и
 * каждый ререндер, держим один результат на пользователя в module-scope кэше.
 *
 * Инвалидация — ОБЯЗАТЕЛЬНА в любом из этих случаев, иначе UI будет видеть
 * устаревший `isOwned`:
 *  - сменилась auth-сессия (`subscribeAuthSession`) — делается автоматически
 *    при импорте модуля.
 *  - пользователь удалил покупку (`revokePurchase`) — вызывается явно в
 *    `@shared/api/purchases/index.ts`.
 *  - любой код, который меняет состав покупок на бэке, должен дёрнуть
 *    `invalidateMyPurchasesCache()`.
 *
 * История: раньше этот кэш жил в `entities/service/lib/useAlbumOwnedByViewer.ts`
 * и про него не знал `revokePurchase`. В результате после удаления покупки из
 * "My Purchases" страница артиста продолжала считать альбом купленным и не
 * показывала Buy-кнопку.
 *
 * Fetch инлайнится здесь специально, чтобы не было кругового импорта
 * `cache.ts ↔ index.ts` (index.ts импортирует `invalidateMyPurchasesCache`
 * из этого модуля).
 */

import { getAuthHeader, subscribeAuthSession } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import type { GetMyPurchasesResponse, Purchase } from './types';

let cachedUserId: string | null = null;
let cachedPurchases: Purchase[] | null = null;
let inflightPurchases: Promise<Purchase[]> | null = null;
let cacheEpoch = 0;
const cacheListeners = new Set<() => void>();

function notifyCacheListeners(): void {
  cacheEpoch += 1;
  cacheListeners.forEach((listener) => listener());
}

/** Подписка на инвалидацию кэша покупок (для refetch в useAlbumOwnedByViewer). */
export function subscribeMyPurchasesCache(onStoreChange: () => void): () => void {
  cacheListeners.add(onStoreChange);
  return () => {
    cacheListeners.delete(onStoreChange);
  };
}

export function getMyPurchasesCacheEpoch(): number {
  return cacheEpoch;
}

if (typeof window !== 'undefined') {
  subscribeAuthSession(() => {
    invalidateMyPurchasesCache();
  });
}

async function fetchMyPurchases(): Promise<Purchase[]> {
  const response = await fetchWithAuthSession('/api/my-purchases', {
    headers: {
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as GetMyPurchasesResponse;
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const data = (await response.json()) as GetMyPurchasesResponse;
  if (!data.success || !data.purchases) {
    throw new Error(data.error || 'Failed to get purchases');
  }

  return data.purchases;
}

/**
 * Загружает покупки для указанного пользователя с использованием кэша.
 * Параллельные вызовы делят один и тот же inflight-запрос.
 */
export async function getMyPurchasesCached(userId: string): Promise<Purchase[]> {
  if (cachedPurchases && cachedUserId === userId) {
    return cachedPurchases;
  }

  if (inflightPurchases) {
    return inflightPurchases;
  }

  inflightPurchases = fetchMyPurchases()
    .then((purchases) => {
      cachedUserId = userId;
      cachedPurchases = purchases;
      return purchases;
    })
    .finally(() => {
      inflightPurchases = null;
    });

  return inflightPurchases;
}

/** Сбрасывает кэш покупок (next read → fresh GET). */
export function invalidateMyPurchasesCache(): void {
  cachedUserId = null;
  cachedPurchases = null;
  inflightPurchases = null;
  notifyCacheListeners();
}

/** @internal Только для тестов: текущее состояние кэша. */
export function __getMyPurchasesCacheStateForTests(): {
  cachedUserId: string | null;
  cachedPurchases: Purchase[] | null;
  hasInflight: boolean;
} {
  return {
    cachedUserId,
    cachedPurchases,
    hasInflight: inflightPurchases !== null,
  };
}
