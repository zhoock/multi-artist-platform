/**
 * Diagnostic trace for collection artist remove button mode transitions.
 * Enable: localStorage.setItem('COLLECTION_REMOVE_TRACE', '1'); location.reload();
 */

export type CollectionRemoveButtonMode =
  | 'time-lock'
  | 'renewal-hold'
  | 'subscription-gate'
  | 'active-remove'
  | 'inactive-remove';

export type CollectionRemoveTraceEntry = {
  ts: string;
  source: string;
  artistUserId?: string;
  billingStatus?: string | null;
  hasPremiumAccess?: boolean;
  autoRenewEnabled?: boolean;
  hasSavedPaymentMethod?: boolean;
  nextChargeAt?: string | null;
  expiresAt?: string | null;
  renewalSettlementPending?: boolean;
  autorenewCollectionHold?: boolean;
  lockedUntil?: string | null;
  timeLocked?: boolean;
  showSubscriptionGate?: boolean;
  mode?: CollectionRemoveButtonMode;
  fetchGeneration?: number;
  extra?: string;
};

const STORAGE_KEY = 'COLLECTION_REMOVE_TRACE';
const MAX_ENTRIES = 200;

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function pushEntry(entry: CollectionRemoveTraceEntry): void {
  if (!isEnabled() || typeof window === 'undefined') return;
  const w = window as Window & { __collectionRemoveTrace?: CollectionRemoveTraceEntry[] };
  const log = w.__collectionRemoveTrace ?? [];
  log.push(entry);
  if (log.length > MAX_ENTRIES) {
    log.splice(0, log.length - MAX_ENTRIES);
  }
  w.__collectionRemoveTrace = log;

  console.info('[collection-remove-trace]', entry);
}

export function traceCollectionRemove(entry: Omit<CollectionRemoveTraceEntry, 'ts'>): void {
  pushEntry({ ts: new Date().toISOString(), ...entry });
}

export function readCollectionRemoveTrace(): CollectionRemoveTraceEntry[] {
  if (typeof window === 'undefined') return [];
  const w = window as Window & { __collectionRemoveTrace?: CollectionRemoveTraceEntry[] };
  return [...(w.__collectionRemoveTrace ?? [])];
}

export function clearCollectionRemoveTraceForTests(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __collectionRemoveTrace?: CollectionRemoveTraceEntry[] };
  w.__collectionRemoveTrace = [];
}
