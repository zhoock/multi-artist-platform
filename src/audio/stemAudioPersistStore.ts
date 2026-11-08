/**
 * IndexedDB (or injectable in-memory) persistence for stem compressed audio bytes.
 * Keyed by stable assetKey — never by signed URL.
 */

export const STEM_AUDIO_PERSIST_SCHEMA_VERSION = 1;
export const DEFAULT_PERSIST_MAX_BYTES = 500 * 1024 * 1024;

const DB_NAME = 'stem-audio-cache-v1';
const STORE_NAME = 'entries';

export type StemAudioPersistRecord = {
  assetKey: string;
  bytes: ArrayBuffer;
  size: number;
  lastAccessedAt: number;
  schemaVersion: number;
};

export type StemAudioPersistStore = {
  get(assetKey: string): Promise<ArrayBuffer | null>;
  put(assetKey: string, bytes: ArrayBuffer): Promise<void>;
  clear(): Promise<void>;
};

type PersistStoreOptions = {
  maxBytes?: number;
};

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, STEM_AUDIO_PERSIST_SCHEMA_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'assetKey' });
        store.createIndex('byLastAccess', 'lastAccessedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'));
  });
}

function idbGetAllRecords(db: IDBDatabase): Promise<StemAudioPersistRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as StemAudioPersistRecord[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('indexedDB.getAll failed'));
  });
}

async function evictIndexedDbUntilRoom(
  db: IDBDatabase,
  maxBytes: number,
  incomingSize: number,
  replaceAssetKey?: string
): Promise<void> {
  const all = await idbGetAllRecords(db);
  let total = all.reduce((sum, row) => sum + row.size, 0);
  const existing = replaceAssetKey
    ? all.find((row) => row.assetKey === replaceAssetKey)
    : undefined;
  if (existing) {
    total -= existing.size;
  }

  if (total + incomingSize <= maxBytes) {
    return;
  }

  const victims = all
    .filter((row) => row.assetKey !== replaceAssetKey)
    .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let needToFree = total + incomingSize - maxBytes;

    for (const row of victims) {
      if (needToFree <= 0) break;
      store.delete(row.assetKey);
      needToFree -= row.size;
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB eviction failed'));
  });
}

export function createIndexedDbStemAudioPersistStore(
  options?: PersistStoreOptions
): StemAudioPersistStore {
  const maxBytes = options?.maxBytes ?? DEFAULT_PERSIST_MAX_BYTES;

  return {
    async get(assetKey) {
      const db = await openIndexedDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(assetKey);
        req.onsuccess = () => {
          const rec = req.result as StemAudioPersistRecord | undefined;
          if (!rec?.bytes?.byteLength) {
            resolve(null);
            return;
          }
          const now = Date.now();
          store.put({ ...rec, lastAccessedAt: now });
          tx.oncomplete = () => resolve(rec.bytes.slice(0));
        };
        req.onerror = () => reject(req.error ?? new Error('indexedDB.get failed'));
        tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
      });
    },

    async put(assetKey, bytes) {
      const size = bytes.byteLength;
      if (size <= 0) return;

      const db = await openIndexedDb();
      await evictIndexedDbUntilRoom(db, maxBytes, size, assetKey);

      const record: StemAudioPersistRecord = {
        assetKey,
        bytes,
        size,
        lastAccessedAt: Date.now(),
        schemaVersion: STEM_AUDIO_PERSIST_SCHEMA_VERSION,
      };

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('indexedDB.put failed'));
      });
    },

    async clear() {
      const db = await openIndexedDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('indexedDB.clear failed'));
      });
    },
  };
}

type InMemoryRow = {
  bytes: ArrayBuffer;
  byteLength: number;
  lastAccessedAt: number;
};

/** Test / fallback backend with the same LRU rules as IndexedDB. */
export function createInMemoryStemAudioPersistStore(
  options?: PersistStoreOptions
): StemAudioPersistStore & {
  getEntryCount(): number;
  getTotalBytes(): number;
  has(assetKey: string): boolean;
} {
  const maxBytes = options?.maxBytes ?? DEFAULT_PERSIST_MAX_BYTES;
  const rows = new Map<string, InMemoryRow>();

  const touch = (key: string, row: InMemoryRow) => {
    row.lastAccessedAt = Date.now();
    rows.delete(key);
    rows.set(key, row);
  };

  const totalBytes = () => {
    let sum = 0;
    for (const row of rows.values()) sum += row.byteLength;
    return sum;
  };

  const evictUntilRoom = (incomingSize: number, replaceKey?: string) => {
    let total = totalBytes();
    const existing = replaceKey ? rows.get(replaceKey) : undefined;
    if (existing) total -= existing.byteLength;

    while (total + incomingSize > maxBytes && rows.size > 0) {
      const oldestKey = rows.keys().next().value as string | undefined;
      if (!oldestKey || oldestKey === replaceKey) {
        break;
      }
      const oldest = rows.get(oldestKey);
      if (!oldest) break;
      rows.delete(oldestKey);
      total -= oldest.byteLength;
    }
  };

  return {
    async get(assetKey) {
      const row = rows.get(assetKey);
      if (!row) return null;
      touch(assetKey, row);
      return row.bytes.slice(0);
    },

    async put(assetKey, bytes) {
      const byteLength = bytes.byteLength;
      if (byteLength <= 0) return;
      evictUntilRoom(byteLength, assetKey);
      if (totalBytes() - (rows.get(assetKey)?.byteLength ?? 0) + byteLength > maxBytes) {
        return;
      }
      const row: InMemoryRow = {
        bytes,
        byteLength,
        lastAccessedAt: Date.now(),
      };
      rows.set(assetKey, row);
      touch(assetKey, row);
    },

    async clear() {
      rows.clear();
    },

    getEntryCount() {
      return rows.size;
    },

    getTotalBytes() {
      return totalBytes();
    },

    has(assetKey: string) {
      return rows.has(assetKey);
    },
  };
}

let testStoreOverride: StemAudioPersistStore | null | undefined;
let defaultIdbStore: StemAudioPersistStore | null | undefined;

function resolveActiveStore(): StemAudioPersistStore | null {
  if (testStoreOverride !== undefined) {
    return testStoreOverride;
  }
  if (!isIndexedDbAvailable()) {
    return null;
  }
  if (!defaultIdbStore) {
    defaultIdbStore = createIndexedDbStemAudioPersistStore();
  }
  return defaultIdbStore;
}

/** Jest: inject in-memory store; pass `null` to simulate unavailable IDB. */
export function setStemAudioPersistStoreForTests(store: StemAudioPersistStore | null): void {
  testStoreOverride = store;
}

export function resetStemAudioPersistStoreForTests(): void {
  testStoreOverride = undefined;
  defaultIdbStore = undefined;
}

export async function clearStemAudioPersistStore(): Promise<void> {
  const store = resolveActiveStore();
  if (!store) return;
  try {
    await store.clear();
  } catch {
    // graceful
  }
}

export async function readStemAudioPersist(assetKey: string): Promise<ArrayBuffer | null> {
  const store = resolveActiveStore();
  if (!store) return null;
  try {
    return await store.get(assetKey);
  } catch {
    return null;
  }
}

export async function writeStemAudioPersist(assetKey: string, bytes: ArrayBuffer): Promise<void> {
  const store = resolveActiveStore();
  if (!store) return;
  try {
    await store.put(assetKey, bytes);
  } catch {
    // graceful — playback must not depend on persistence
  }
}
