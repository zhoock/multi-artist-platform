import {
  canClaimTrackProcessingLock,
  claimTrackProcessingLockSql,
  releaseTrackProcessingLockSql,
  TRACK_PROCESSING_LOCK_LEASE_MS,
  type TrackProcessingLockRow,
} from '../../../../src/shared/lib/audio/trackProcessingLock';

type TrackLockStore = ReturnType<typeof createTrackLockStore>;

const harness: {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<{ id: string }>; rowCount: number }>;
  store: TrackLockStore | null;
} = {
  query: async () => ({ rows: [], rowCount: 0 }),
  store: null,
};

jest.mock('../lib/pool.js', () => ({
  getPool: () => ({
    connect: async () => ({
      query: (sql: string, params?: unknown[]) => harness.query(sql, params),
      release: () => undefined,
    }),
  }),
}));

import { runWithTrackProcessingLock } from '../lib/db';

/**
 * One row per track. The claim mutation is synchronous, which is the same
 * visibility a committed UPDATE has for the next transaction on the pooler:
 * the second statement sees the token before it decides to run ffmpeg.
 */
function createTrackLockStore(nowMs: () => number) {
  const rows = new Map<string, TrackProcessingLockRow>();

  return {
    rows,
    async query(sql: string, params: unknown[] = []) {
      const trackId = String(params[0]);
      const token = String(params[1]);
      const row = rows.get(trackId) ?? { token: null, lockedAtMs: null };

      if (sql === claimTrackProcessingLockSql()) {
        if (!canClaimTrackProcessingLock(row, nowMs())) {
          return { rows: [], rowCount: 0 };
        }
        rows.set(trackId, { token, lockedAtMs: nowMs() });
        return { rows: [{ id: trackId }], rowCount: 1 };
      }

      if (sql === releaseTrackProcessingLockSql()) {
        if (row.token !== token) {
          return { rows: [], rowCount: 0 };
        }
        rows.set(trackId, { token: null, lockedAtMs: null });
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL in track lock store: ${sql}`);
    },
  };
}

describe('runWithTrackProcessingLock', () => {
  let nowMs = 1_700_000_000_000;

  beforeEach(() => {
    nowMs = 1_700_000_000_000;
    const store = createTrackLockStore(() => nowMs);
    harness.store = store;
    harness.query = store.query.bind(store);
  });

  function store(): TrackLockStore {
    if (!harness.store) {
      throw new Error('track lock store is not initialized');
    }
    return harness.store;
  }

  test('two concurrent jobs for one track do not run the pipeline together', async () => {
    let active = 0;
    let maxActive = 0;

    const run = () =>
      runWithTrackProcessingLock('track-1', async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 40));
        active -= 1;
      });

    const results = await Promise.all([run(), run()]);

    expect(results.sort()).toEqual(['completed', 'skipped']);
    expect(maxActive).toBe(1);
    expect(store().rows.get('track-1')).toEqual({ token: null, lockedAtMs: null });
  });

  test('two tracks can be processed at the same time', async () => {
    let active = 0;
    let maxActive = 0;

    const run = (trackId: string) =>
      runWithTrackProcessingLock(trackId, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
      });

    const results = await Promise.all([run('track-1'), run('track-2')]);

    expect(results).toEqual(['completed', 'completed']);
    expect(maxActive).toBe(2);
  });

  test('a fresh claim blocks the second job, and the owner release lets the next one run', async () => {
    store().rows.set('track-1', { token: 'live-owner', lockedAtMs: nowMs });

    const blocked = await runWithTrackProcessingLock('track-1', async () => {
      throw new Error('must not process');
    });
    expect(blocked).toBe('skipped');
    expect(store().rows.get('track-1')?.token).toBe('live-owner');

    store().rows.set('track-1', { token: null, lockedAtMs: null });
    const next = await runWithTrackProcessingLock('track-1', async () => undefined);
    expect(next).toBe('completed');
  });

  test('a claim older than the background function limit can be taken by the next job', async () => {
    store().rows.set('track-1', {
      token: 'dead-owner',
      lockedAtMs: nowMs - TRACK_PROCESSING_LOCK_LEASE_MS - 1,
    });

    const result = await runWithTrackProcessingLock('track-1', async () => undefined);

    expect(result).toBe('completed');
    expect(store().rows.get('track-1')).toEqual({ token: null, lockedAtMs: null });
  });

  test('a failed release from the previous owner does not clear the new claim', async () => {
    let tokenWhileRunning: string | null = null;

    await runWithTrackProcessingLock('track-1', async () => {
      await harness.query(releaseTrackProcessingLockSql(), ['track-1', 'previous-owner']);
      tokenWhileRunning = store().rows.get('track-1')?.token ?? null;
    });

    expect(tokenWhileRunning).toEqual(expect.any(String));
    expect(tokenWhileRunning).not.toBe('previous-owner');
    expect(store().rows.get('track-1')).toEqual({ token: null, lockedAtMs: null });
  });

  test('a thrown job releases the claim so a retry can start', async () => {
    await expect(
      runWithTrackProcessingLock('track-1', async () => {
        throw new Error('ffmpeg failed');
      })
    ).rejects.toThrow('ffmpeg failed');

    expect(store().rows.get('track-1')).toEqual({ token: null, lockedAtMs: null });

    const retry = await runWithTrackProcessingLock('track-1', async () => undefined);
    expect(retry).toBe('completed');
  });
});
