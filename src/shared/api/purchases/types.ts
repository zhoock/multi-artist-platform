/**
 * Общие типы для API покупок (account-owned library).
 *
 * Вынесены в отдельный файл, чтобы их могли импортировать одновременно
 * `index.ts` (HTTP-вызовы) и `cache.ts` (module-scope кэш) без кругового
 * импорта.
 */

export interface PurchaseTrack {
  trackId: string;
  title: string;
}

export interface Purchase {
  id: string;
  orderId: string;
  albumId: string;
  /** Album owner in Storage (cover in user bucket) */
  albumUserId?: string | null;
  artistDisplayName: string;
  album: string;
  cover: string | null;
  purchaseToken: string;
  purchasedAt: string;
  downloadCount: number;
  tracks: PurchaseTrack[];
}

export interface GetMyPurchasesResponse {
  success: boolean;
  purchases?: Purchase[];
  error?: string;
}

export interface ApiMessageResponse {
  success?: boolean;
  error?: string;
  message?: string;
}
