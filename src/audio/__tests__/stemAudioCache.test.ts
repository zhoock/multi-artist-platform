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
} from '../stemAudioPersistStore';

const ASSET_A = 'artist:album:track:stem-a.mp3';
const ASSET_B = 'artist:album:track:stem-b.mp3';
const URL_A =
  '/api/stems/audio?artistUserId=artist&albumId=album&trackId=track&file=stem-a.mp3&accessToken=x&expiresAt=1';
const URL_A2 =
  '/api/stems/audio?artistUserId=artist&albumId=album&trackId=track&file=stem-a.mp3&accessToken=y&expiresAt=2';

function defaultFetchResponse(byteLength = 4): Response {
  return {
    ok: true,
    headers: { get: () => 'audio/mpeg' },
    arrayBuffer: async () => new Uint8Array(byteLength).buffer,
  } as unknown as Response;
}

describe('stemAudioCache', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    resetStemAudioCacheForTests({ maxBytes: 50 * 1024 * 1024 });
    resetStemAudioPersistStoreForTests();
    const persist = createInMemoryStemAudioPersistStore();
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

  test('Test A — first load: one network request per stem', async () => {
    const URL_B =
      '/api/stems/audio?artistUserId=artist&albumId=album&trackId=track&file=stem-b.mp3&accessToken=x&expiresAt=1';
    await getStemAudioBytes(ASSET_A, URL_A);
    await getStemAudioBytes(ASSET_B, URL_B);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('Test B — second load same assetKey: zero new requests', async () => {
    await getStemAudioBytes(ASSET_A, URL_A);
    fetchMock.mockClear();
    const bytes = await getStemAudioBytes(ASSET_A, URL_A2);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(bytes.byteLength).toBe(4);
  });

  test('Test C — concurrent strict-mode style: one network request', async () => {
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
  });

  test('Test I — failed request is not cached; retry fetches once', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('network')));
    fetchMock.mockImplementationOnce(async () => defaultFetchResponse(1));

    await expect(getStemAudioBytes(ASSET_A, URL_A)).rejects.toThrow('network');
    expect(getStemAudioCacheStats().entries).toBe(0);

    await getStemAudioBytes(ASSET_A, URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    await getStemAudioBytes(ASSET_A, URL_A2);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test('Test J — different asset keys are independent', async () => {
    const URL_B =
      '/api/stems/audio?artistUserId=artist&albumId=album&trackId=track&file=stem-b.mp3&accessToken=x&expiresAt=1';
    await getStemAudioBytes(ASSET_A, URL_A);
    await getStemAudioBytes(ASSET_B, URL_B);
    fetchMock.mockClear();
    await getStemAudioBytes(ASSET_A, URL_A2);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    fetchMock.mockClear();
    await getStemAudioBytes(ASSET_B, URL_B);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test('Test K — RAM eviction still serves from persist without network', async () => {
    resetStemAudioCacheForTests({ maxBytes: 4 });
    await getStemAudioBytes(ASSET_A, URL_A);
    expect(getStemAudioCacheStats().entries).toBe(1);

    fetchMock.mockClear();
    const URL_B =
      '/api/stems/audio?artistUserId=artist&albumId=album&trackId=track&file=stem-b.mp3&accessToken=x&expiresAt=1';
    await getStemAudioBytes(ASSET_B, URL_B);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    await getStemAudioBytes(ASSET_A, URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
