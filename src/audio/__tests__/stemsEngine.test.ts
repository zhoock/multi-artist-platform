import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { StemEngine } from '../stemsEngine';

class FakeGain {
  gain = { value: 1 };
  connect = jest.fn();
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
