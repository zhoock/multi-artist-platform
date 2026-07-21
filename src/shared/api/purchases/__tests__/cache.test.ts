/**
 * Регрессионные тесты для кэша покупок и его инвалидации.
 *
 * Покрывают баг: после удаления покупки из "My Purchases" страница артиста
 * продолжала считать альбом купленным, потому что `revokePurchase` не
 * сбрасывал module-scope кэш `getMyPurchasesCached`.
 *
 * Используем `jest.isolateModulesAsync`, чтобы каждый тест получал свежий
 * экземпляр модуля (иначе кэш module-уровня переживает тесты).
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

import type { Purchase } from '@shared/api/purchases';

type AuthFetchModule = typeof import('@shared/lib/authFetch');
type PurchasesModule = typeof import('@shared/api/purchases');

const USER_ID = 'user-123';
const OTHER_USER_ID = 'user-999';

function purchase(id: string, albumId = `album-${id}`): Purchase {
  return {
    id,
    orderId: `order-${id}`,
    albumId,
    artist: 'Artist',
    album: 'Album',
    cover: null,
    purchaseToken: `tok-${id}`,
    purchasedAt: '2026-01-01T00:00:00.000Z',
    downloadCount: 0,
    tracks: [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  // Минимальный duck-type Response: jsdom не предоставляет глобальный
  // конструктор Response, а кэш использует только { ok, status, json() }.
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

function purchasesResponse(purchases: Purchase[]) {
  return jsonResponse({ success: true, purchases });
}

function mockAuthFetchOnce(impl: AuthFetchModule['fetchWithAuthSession']) {
  jest.doMock('@shared/lib/authFetch', () => ({
    fetchWithAuthSession: jest.fn(impl),
  }));
}

function mockAuth() {
  jest.doMock('@shared/lib/auth', () => ({
    getAuthHeader: () => ({ Authorization: 'Bearer test' }),
    subscribeAuthSession: jest.fn(() => () => {}),
  }));
}

describe('purchases cache', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.dontMock('@shared/lib/authFetch');
    jest.dontMock('@shared/lib/auth');
  });

  test('getMyPurchasesCached caches by user id (single fetch for repeated reads)', async () => {
    await jest.isolateModulesAsync(async () => {
      mockAuth();
      const fetchSpy = jest.fn(async () => purchasesResponse([purchase('p1')]));
      mockAuthFetchOnce(fetchSpy);

      const { getMyPurchasesCached } = (await import('@shared/api/purchases')) as PurchasesModule;

      const first = await getMyPurchasesCached(USER_ID);
      const second = await getMyPurchasesCached(USER_ID);

      expect(first).toEqual(second);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  test('parallel calls dedupe to a single inflight request', async () => {
    await jest.isolateModulesAsync(async () => {
      mockAuth();
      let resolve: ((r: Response) => void) | null = null;
      const fetchSpy = jest.fn(
        () =>
          new Promise<Response>((res) => {
            resolve = res;
          })
      );
      mockAuthFetchOnce(fetchSpy);

      const { getMyPurchasesCached } = (await import('@shared/api/purchases')) as PurchasesModule;

      const promiseA = getMyPurchasesCached(USER_ID);
      const promiseB = getMyPurchasesCached(USER_ID);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      resolve!(purchasesResponse([purchase('p1')]));

      const [a, b] = await Promise.all([promiseA, promiseB]);
      expect(a).toBe(b);
    });
  });

  test('switching user id triggers a fresh fetch', async () => {
    await jest.isolateModulesAsync(async () => {
      mockAuth();
      const fetchSpy = jest
        .fn()
        .mockImplementationOnce(async () => purchasesResponse([purchase('p1')]))
        .mockImplementationOnce(async () => purchasesResponse([purchase('p2')]));
      mockAuthFetchOnce(fetchSpy as AuthFetchModule['fetchWithAuthSession']);

      const { getMyPurchasesCached } = (await import('@shared/api/purchases')) as PurchasesModule;

      const first = await getMyPurchasesCached(USER_ID);
      const second = await getMyPurchasesCached(OTHER_USER_ID);

      expect(first[0].id).toBe('p1');
      expect(second[0].id).toBe('p2');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  test('invalidateMyPurchasesCache forces a fresh fetch on next read', async () => {
    await jest.isolateModulesAsync(async () => {
      mockAuth();
      const fetchSpy = jest
        .fn()
        .mockImplementationOnce(async () => purchasesResponse([purchase('p1')]))
        .mockImplementationOnce(async () => purchasesResponse([purchase('p2')]));
      mockAuthFetchOnce(fetchSpy as AuthFetchModule['fetchWithAuthSession']);

      const { getMyPurchasesCached, invalidateMyPurchasesCache } = (await import(
        '@shared/api/purchases'
      )) as PurchasesModule;

      const first = await getMyPurchasesCached(USER_ID);
      expect(first[0].id).toBe('p1');

      invalidateMyPurchasesCache();

      const second = await getMyPurchasesCached(USER_ID);
      expect(second[0].id).toBe('p2');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  test('invalidateMyPurchasesCache notifies cache subscribers', async () => {
    await jest.isolateModulesAsync(async () => {
      mockAuth();
      mockAuthFetchOnce(async () => purchasesResponse([]));

      const { getMyPurchasesCacheEpoch, invalidateMyPurchasesCache, subscribeMyPurchasesCache } =
        (await import(
          '@shared/api/purchases/cache'
        )) as typeof import('@shared/api/purchases/cache');

      expect(getMyPurchasesCacheEpoch()).toBe(0);

      const listener = jest.fn();
      const unsubscribe = subscribeMyPurchasesCache(listener);

      invalidateMyPurchasesCache();
      expect(getMyPurchasesCacheEpoch()).toBe(1);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      invalidateMyPurchasesCache();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // Это и есть прямой регресс на исходный баг.
  test('revokePurchase invalidates the cache so next read sees fresh data', async () => {
    await jest.isolateModulesAsync(async () => {
      mockAuth();
      const fetchSpy = jest
        .fn<AuthFetchModule['fetchWithAuthSession']>()
        // initial GET
        .mockImplementationOnce(async () => purchasesResponse([purchase('p1'), purchase('p2')]))
        // DELETE
        .mockImplementationOnce(async () => jsonResponse({ success: true }))
        // refresh GET after revoke
        .mockImplementationOnce(async () => purchasesResponse([purchase('p2')]));
      mockAuthFetchOnce(fetchSpy as AuthFetchModule['fetchWithAuthSession']);

      const { getMyPurchasesCached, revokePurchase } = (await import(
        '@shared/api/purchases'
      )) as PurchasesModule;

      const before = await getMyPurchasesCached(USER_ID);
      expect(before.map((p) => p.id)).toEqual(['p1', 'p2']);

      await revokePurchase('p1');

      const after = await getMyPurchasesCached(USER_ID);
      expect(after.map((p) => p.id)).toEqual(['p2']);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      const deleteCall = fetchSpy.mock.calls[1];
      expect(deleteCall[0]).toContain('/api/my-purchases?purchaseId=p1');
      expect((deleteCall[1] as RequestInit | undefined)?.method).toBe('DELETE');
    });
  });

  test('failed revokePurchase does NOT invalidate the cache', async () => {
    await jest.isolateModulesAsync(async () => {
      mockAuth();
      const fetchSpy = jest
        .fn<AuthFetchModule['fetchWithAuthSession']>()
        .mockImplementationOnce(async () => purchasesResponse([purchase('p1')]))
        .mockImplementationOnce(async () => jsonResponse({ error: 'nope' }, 500));
      mockAuthFetchOnce(fetchSpy as AuthFetchModule['fetchWithAuthSession']);

      const { getMyPurchasesCached, revokePurchase } = (await import(
        '@shared/api/purchases'
      )) as PurchasesModule;

      const before = await getMyPurchasesCached(USER_ID);
      expect(before[0].id).toBe('p1');

      await expect(revokePurchase('p1')).rejects.toThrow(/nope/);

      const after = await getMyPurchasesCached(USER_ID);
      expect(after[0].id).toBe('p1');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
