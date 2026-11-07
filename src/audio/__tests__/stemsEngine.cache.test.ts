import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { StemEngine } from '../stemsEngine';
import { resetStemAudioCacheForTests } from '../stemAudioCache';

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  createGain() {
    return { gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      disconnect: jest.fn(),
      onended: null,
    };
  }
  decodeAudioData = jest.fn(async () => ({ duration: 10 }) as unknown as AudioBuffer);
  resume = jest.fn(async () => {});
  suspend = jest.fn(async () => {});
  close = jest.fn();
}

const ASSET_KEY = 'u:al:tr:file.mp3';
const URL =
  '/api/stems/audio?artistUserId=u&albumId=al&trackId=tr&file=file.mp3&accessToken=a&expiresAt=1';

describe('StemEngine with stem audio cache', () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    resetStemAudioCacheForTests();
    originalFetch = global.fetch;
    fetchMock = jest.fn(
      async () =>
        ({
          ok: true,
          headers: { get: () => 'audio/mpeg' },
          arrayBuffer: async () => new Uint8Array(16).buffer,
        }) as unknown as Response
    );
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetStemAudioCacheForTests();
  });

  test('StrictMode-style double loadAll issues one fetch per stem', async () => {
    const stems = { a: { url: URL, assetKey: ASSET_KEY } };
    const ctx = new FakeAudioContext();

    const e1 = new StemEngine(stems, ctx as unknown as AudioContext);
    await e1.loadAll();
    e1.dispose();

    fetchMock.mockClear();
    const e2 = new StemEngine(stems, ctx as unknown as AudioContext);
    await e2.loadAll();
    e2.dispose();

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(e2.loadedStemCount).toBe(1);
  });
});
