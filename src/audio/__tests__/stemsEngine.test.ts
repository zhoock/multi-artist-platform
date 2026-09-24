import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { StemEngine, StemEnginePlayError } from '../stemsEngine';

class FakeGain {
  gain = { value: 1 };
  connect = jest.fn();
  disconnect = jest.fn();
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = jest.fn();
  start = jest.fn();
  stop = jest.fn();
  disconnect = jest.fn();
}

class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  gains: FakeGain[] = [];
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource() {
    return new FakeBufferSource();
  }
  decodeAudioData = jest.fn(async () => ({ duration: 10 }) as unknown as AudioBuffer);
  resume = jest.fn(async () => {});
  suspend = jest.fn(async () => {});
  close = jest.fn();
}

/** Узлы стемов, созданные после masterGain (gains[0]). */
function stemGains(ctx: FakeAudioContext): FakeGain[] {
  return ctx.gains.slice(1);
}

function newEngine(ctx: FakeAudioContext, stems: Record<string, string>) {
  return new StemEngine(stems, ctx as unknown as AudioContext);
}

describe('StemEngine mix controls', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'audio/wav' },
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('setVolume scales the stem gain', async () => {
    const ctx = new FakeAudioContext();
    const engine = newEngine(ctx, { a: 'urlA' });
    await engine.loadAll();

    const [a] = stemGains(ctx);
    expect(a.gain.value).toBe(1);

    engine.setVolume('a', 0.5);
    expect(a.gain.value).toBe(0.5);
  });

  test('mute silences the stem and unmute restores the previous volume', async () => {
    const ctx = new FakeAudioContext();
    const engine = newEngine(ctx, { a: 'urlA' });
    await engine.loadAll();
    const [a] = stemGains(ctx);

    engine.setVolume('a', 0.5);
    engine.setMuted('a', true);
    expect(a.gain.value).toBe(0);

    engine.setMuted('a', false);
    expect(a.gain.value).toBe(0.5);
  });

  test('volume set before loadAll is applied once stems are loaded', async () => {
    const ctx = new FakeAudioContext();
    const engine = newEngine(ctx, { a: 'urlA' });

    engine.setVolume('a', 0.25);
    await engine.loadAll();

    const [a] = stemGains(ctx);
    expect(a.gain.value).toBe(0.25);
  });

  test('solo mutes every other stem; clearing solo restores all', async () => {
    const ctx = new FakeAudioContext();
    const engine = newEngine(ctx, { a: 'urlA', b: 'urlB' });
    await engine.loadAll();

    engine.setSolo('a', true);
    const soloValues = stemGains(ctx)
      .map((g) => g.gain.value)
      .sort();
    expect(soloValues).toEqual([0, 1]);

    engine.setSolo('a', false);
    expect(stemGains(ctx).every((g) => g.gain.value === 1)).toBe(true);
  });

  test('mute still applies to a soloed stem', async () => {
    const ctx = new FakeAudioContext();
    const engine = newEngine(ctx, { a: 'urlA' });
    await engine.loadAll();
    const [a] = stemGains(ctx);

    engine.setSolo('a', true);
    expect(a.gain.value).toBe(1);

    engine.setMuted('a', true);
    expect(a.gain.value).toBe(0);
  });
});

describe('StemEngine load failures', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('all stems rejected throws and leaves no playable nodes', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof global.fetch;

    const ctx = new FakeAudioContext();
    const engine = newEngine(ctx, { a: 'urlA', b: 'urlB' });

    await expect(engine.loadAll()).rejects.toThrow('Не удалось загрузить ни одного стема');
    expect(engine.hasPlayableNodes()).toBe(false);
  });

  test('partial rejection returns loaded and failed stem ids', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('bad')) {
        throw new Error('bad stem');
      }
      return {
        ok: true,
        headers: { get: () => 'audio/wav' },
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    }) as unknown as typeof global.fetch;

    const ctx = new FakeAudioContext();
    const engine = newEngine(ctx, { good: 'https://x/good.wav', bad: 'https://x/bad.wav' });

    const result = await engine.loadAll();
    expect(result.loadedStemIds).toEqual(['good']);
    expect(result.failedStemIds).toEqual(['bad']);
    expect(engine.hasPlayableNodes()).toBe(true);
  });

  test('play() with no nodes throws and does not set playing=true', async () => {
    const ctx = new FakeAudioContext();
    const engine = newEngine(ctx, { a: 'urlA' });

    await expect(engine.play()).rejects.toBeInstanceOf(StemEnginePlayError);
    expect(engine.isPlaying).toBe(false);
  });

  test('play() after successful load sets playing=true', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'audio/wav' },
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof global.fetch;

    const ctx = new FakeAudioContext();
    const engine = newEngine(ctx, { a: 'urlA' });
    await engine.loadAll();
    await engine.play();
    expect(engine.isPlaying).toBe(true);
  });

  test('play() propagates audio context unlock failure', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'audio/wav' },
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof global.fetch;

    const ctx = new FakeAudioContext();
    ctx.resume = jest.fn(async () => {
      throw new DOMException('blocked', 'NotAllowedError');
    });
    ctx.state = 'suspended';

    const engine = newEngine(ctx, { a: 'urlA' });
    await engine.loadAll();

    await expect(engine.play()).rejects.toMatchObject({
      code: 'AUDIO_CONTEXT_BLOCKED',
    });
    expect(engine.isPlaying).toBe(false);
  });
});
