import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  getStemAudioBytes,
  resetStemAudioCacheForTests,
  getStemAudioCacheStats,
} from '../stemAudioCache';
import {
  createInMemoryStemAudioPersistStore,
  resetStemAudioPersistStoreForTests,
  setStemAudioPersistStoreForTests,
  type StemAudioPersistStore,
} from '../stemAudioPersistStore';

const ASSET_A = 'artist:album:track:stem-aaa.opus';
const ASSET_B = 'artist:album:track:stem-bbb.opus';
const ASSET_C = 'artist:album:track:stem-ccc.opus';
const URL_A =
  '/api/stems/audio?artistUserId=artist&albumId=album&trackId=track&file=stem-aaa.opus&accessToken=x&expiresAt=1';
const URL_A2 =
  '/api/stems/audio?artistUserId=artist&albumId=album&trackId=track&file=stem-aaa.opus&accessToken=y&expiresAt=2';
const URL_B =
  '/api/stems/audio?artistUserId=artist&albumId=album&trackId=track&file=stem-bbb.opus&accessToken=x&expiresAt=1';
const URL_C =
  '/api/stems/audio?artistUserId=artist&albumId=album&trackId=track&file=stem-ccc.opus&accessToken=x&expiresAt=1';

function defaultFetchResponse(byteLength = 4): Response {
  return {
    ok: true,
    headers: { get: () => 'audio/opus' },
    arrayBuffer: async () => new Uint8Array(byteLength).fill(7).buffer,
  } as unknown as Response;
}

describe('stemAudioCache persistent layer', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let persist: ReturnType<typeof createInMemoryStemAudioPersistStore>;

  beforeEach(async () => {
    resetStemAudioCacheForTests({ maxBytes: 50 * 1024 * 1024 });
    resetStemAudioPersistStoreForTests();
    persist = createInMemoryStemAudioPersistStore({ maxBytes: 50 * 1024 * 1024 });
    setStemAudioPersistStoreForTests(persist);
    await persist.clear();

    originalFetch = global.fetch;
    fetchMock = jest.fn(async () => defaultFetchResponse());
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetStemAudioCacheForTests();
    resetStemAudioPersistStoreForTests();
  });

  test('1 — first network fetch: RAM + IndexedDB', async () => {
    const bytes = await getStemAudioBytes(ASSET_A, URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bytes.byteLength).toBe(4);
    expect(getStemAudioCacheStats().entries).toBe(1);
    expect(persist.has(ASSET_A)).toBe(true);
    expect(persist.getTotalBytes()).toBe(4);
  });

  test('2 — same session RAM hit', async () => {
    await getStemAudioBytes(ASSET_A, URL_A);
    fetchMock.mockClear();
    await getStemAudioBytes(ASSET_A, URL_A2);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(getStemAudioCacheStats().entries).toBe(1);
  });

  test('3 — after RAM clear: persist hit hydrates RAM', async () => {
    const first = await getStemAudioBytes(ASSET_A, URL_A);
    resetStemAudioCacheForTests({ maxBytes: 50 * 1024 * 1024 });
    expect(getStemAudioCacheStats().entries).toBe(0);

    fetchMock.mockClear();
    const second = await getStemAudioBytes(ASSET_A, URL_A2);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(second.byteLength).toBe(first.byteLength);
    expect(getStemAudioCacheStats().entries).toBe(1);
  });

  test('4 — simulated reload: empty RAM module state, persist hit', async () => {
    await getStemAudioBytes(ASSET_A, URL_A);
    resetStemAudioCacheForTests({ maxBytes: 50 * 1024 * 1024 });
    fetchMock.mockClear();

    const bytes = await getStemAudioBytes(ASSET_A, URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(bytes.byteLength).toBe(4);
  });

  test('5 — cache miss: network + dual write', async () => {
    await getStemAudioBytes(ASSET_A, URL_A);
    fetchMock.mockClear();
    await getStemAudioBytes(ASSET_B, URL_B);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(persist.has(ASSET_B)).toBe(true);
    expect(getStemAudioCacheStats().entries).toBe(2);
  });

  test('6 — persist errors: playback via network', async () => {
    const failingStore: StemAudioPersistStore = {
      get: () => Promise.reject(new Error('idb read')),
      put: () => Promise.reject(new Error('idb write')),
      clear: async () => {},
    };
    setStemAudioPersistStoreForTests(failingStore);

    await getStemAudioBytes(ASSET_A, URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resetStemAudioCacheForTests({ maxBytes: 50 * 1024 * 1024 });
    fetchMock.mockClear();
    await getStemAudioBytes(ASSET_A, URL_A2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('6b — persist unavailable (null backend)', async () => {
    setStemAudioPersistStoreForTests(null);
    await getStemAudioBytes(ASSET_A, URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('7 — persist LRU evicts oldest', async () => {
    resetStemAudioPersistStoreForTests();
    const tiny = createInMemoryStemAudioPersistStore({ maxBytes: 11 });
    setStemAudioPersistStoreForTests(tiny);
    await tiny.clear();

    fetchMock.mockImplementation(async () => defaultFetchResponse(4));

    await getStemAudioBytes(ASSET_A, URL_A);
    await getStemAudioBytes(ASSET_B, URL_B);
    expect(tiny.has(ASSET_A)).toBe(true);
    expect(tiny.has(ASSET_B)).toBe(true);

    resetStemAudioCacheForTests({ maxBytes: 50 * 1024 * 1024 });
    await getStemAudioBytes(ASSET_B, URL_B);

    fetchMock.mockClear();
    await getStemAudioBytes(ASSET_C, URL_C);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(tiny.has(ASSET_A)).toBe(false);
    expect(tiny.has(ASSET_B)).toBe(true);
    expect(tiny.has(ASSET_C)).toBe(true);

    fetchMock.mockClear();
    await getStemAudioBytes(ASSET_B, URL_B);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test('8 — concurrent same assetKey: one network fetch', async () => {
    let resolveFetch: () => void;
    const gate = new Promise<void>((r) => {
      resolveFetch = r;
    });
    fetchMock.mockImplementation(async () => {
      await gate;
      return defaultFetchResponse(8);
    });

    const p1 = getStemAudioBytes(ASSET_A, URL_A);
    const p2 = getStemAudioBytes(ASSET_A, URL_A2);
    resolveFetch!();
    await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(persist.getEntryCount()).toBe(1);
  });

  test('9 — new filename / assetKey does not use old bytes', async () => {
    fetchMock.mockImplementationOnce(async () => defaultFetchResponse(4));
    await getStemAudioBytes(ASSET_A, URL_A);

    fetchMock.mockImplementationOnce(async () => defaultFetchResponse(9));
    resetStemAudioCacheForTests({ maxBytes: 50 * 1024 * 1024 });
    const bytesB = await getStemAudioBytes(ASSET_B, URL_B);

    expect(bytesB.byteLength).toBe(9);
    expect(persist.has(ASSET_A)).toBe(true);
    expect(persist.has(ASSET_B)).toBe(true);

    fetchMock.mockClear();
    const againB = await getStemAudioBytes(ASSET_B, URL_B);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(againB.byteLength).toBe(9);
  });
});
