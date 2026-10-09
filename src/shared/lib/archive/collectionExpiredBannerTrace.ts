/**
 * Expired choose-plan banner diagnostics on /dashboard/collection.
 * Enable: localStorage.setItem('COLLECTION_BILLING_BANNER_TRACE', '1'); location.reload();
 */

export type CollectionExpiredBannerTraceEntry = {
  ts: string;
  source: string;
  billingScreen?: string;
  autorenewCollectionHold?: boolean;
  showExpiredBanner?: boolean;
  hasPremiumAccess?: boolean;
  status?: string | null;
  autoRenewEnabled?: boolean;
  hasSavedPaymentMethod?: boolean;
  nextChargeAt?: string | null;
  expiresAt?: string | null;
  sharedClockMs?: number;
  wallClockMs?: number;
  clockSkewMs?: number;
  premiumLoading?: boolean;
  artistCount?: number;
  fetchSource?: string;
};

const STORAGE_KEY = 'COLLECTION_BILLING_BANNER_TRACE';
const MAX_ENTRIES = 200;

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function pushEntry(entry: CollectionExpiredBannerTraceEntry): void {
  if (!isEnabled() || typeof window === 'undefined') return;
  const w = window as Window & {
    __collectionExpiredBannerTrace?: CollectionExpiredBannerTraceEntry[];
  };
  const log = w.__collectionExpiredBannerTrace ?? [];
  log.push(entry);
  if (log.length > MAX_ENTRIES) {
    log.splice(0, log.length - MAX_ENTRIES);
  }
  w.__collectionExpiredBannerTrace = log;

  console.info('[collection-expired-banner-trace]', entry);
}

export function traceCollectionExpiredBanner(
  entry: Omit<CollectionExpiredBannerTraceEntry, 'ts'>
): void {
  pushEntry({ ts: new Date().toISOString(), ...entry });
}

export function readCollectionExpiredBannerTrace(): CollectionExpiredBannerTraceEntry[] {
  if (typeof window === 'undefined') return [];
  const w = window as Window & {
    __collectionExpiredBannerTrace?: CollectionExpiredBannerTraceEntry[];
  };
  return [...(w.__collectionExpiredBannerTrace ?? [])];
}

export function clearCollectionExpiredBannerTraceForTests(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & {
    __collectionExpiredBannerTrace?: CollectionExpiredBannerTraceEntry[];
  };
  w.__collectionExpiredBannerTrace = [];
}
