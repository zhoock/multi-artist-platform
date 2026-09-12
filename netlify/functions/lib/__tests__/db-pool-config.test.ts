/**
 * Guards the pool options that keep PostgreSQL connections alive between warm Netlify
 * invocations. A short idle timeout makes every request pay ~2s of TCP + TLS + SCRAM
 * to the Supabase pooler again, so these values are load-bearing for API latency.
 *
 * No real database: `pg` is mocked and only the Pool constructor options are asserted.
 */

import type { PoolConfig } from 'pg';

const poolConfigs: PoolConfig[] = [];

jest.mock('pg', () => {
  class FakePool {
    constructor(config: PoolConfig) {
      poolConfigs.push(config);
    }
    on(): this {
      return this;
    }
    query(): Promise<{ rows: unknown[] }> {
      return Promise.resolve({ rows: [] });
    }
    end(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { Pool: FakePool };
});

const LEGACY_IDLE_TIMEOUT_MS = 10_000;

async function createPoolConfig(env: Record<string, string | undefined>): Promise<PoolConfig> {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const { query } = await import('../db');
  await query('SELECT 1');

  expect(poolConfigs).toHaveLength(1);
  return poolConfigs[0];
}

describe('shared PostgreSQL pool configuration', () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    poolConfigs.length = 0;
    globalThis.__appPgPool = undefined;
    globalThis.__appPgPoolFingerprint = undefined;
    globalThis.__appPgPoolShutdownRegistered = undefined;

    process.env = { ...env };
    process.env.DATABASE_URL =
      'postgresql://user:pw@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';
    delete process.env.PG_POOL_MAX;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.LAMBDA_TASK_ROOT;
  });

  afterAll(() => {
    process.env = env;
  });

  describe('on Netlify Functions (AWS Lambda runtime)', () => {
    it('keeps idle connections well past the former 10s timeout', async () => {
      const config = await createPoolConfig({ AWS_LAMBDA_FUNCTION_NAME: 'artist-albums-catalog' });

      expect(config.idleTimeoutMillis).toBeGreaterThan(LEGACY_IDLE_TIMEOUT_MS);
      expect(config.idleTimeoutMillis).toBeGreaterThanOrEqual(60_000);
    });

    it('does not unref idle connections, so a frozen container keeps them', async () => {
      const config = await createPoolConfig({ AWS_LAMBDA_FUNCTION_NAME: 'artist-albums-catalog' });

      expect(config.allowExitOnIdle).toBe(false);
    });

    it('is detected via LAMBDA_TASK_ROOT as well', async () => {
      const config = await createPoolConfig({ LAMBDA_TASK_ROOT: '/var/task' });

      expect(config.allowExitOnIdle).toBe(false);
      expect(config.idleTimeoutMillis).toBeGreaterThan(LEGACY_IDLE_TIMEOUT_MS);
    });

    it('still caps connections at the default pool max of 2', async () => {
      const config = await createPoolConfig({ AWS_LAMBDA_FUNCTION_NAME: 'artist-albums-catalog' });

      expect(config.max).toBe(2);
    });
  });

  describe('outside the serverless runtime', () => {
    it('lets one-shot CLI scripts exit without calling closePool()', async () => {
      const config = await createPoolConfig({});

      expect(config.allowExitOnIdle).toBe(true);
      expect(config.idleTimeoutMillis).toBe(LEGACY_IDLE_TIMEOUT_MS);
    });

    it('still caps connections at the default pool max of 2', async () => {
      const config = await createPoolConfig({});

      expect(config.max).toBe(2);
    });
  });

  it('honours an explicit PG_POOL_MAX override', async () => {
    const config = await createPoolConfig({
      AWS_LAMBDA_FUNCTION_NAME: 'artist-albums-catalog',
      PG_POOL_MAX: '5',
    });

    expect(config.max).toBe(5);
  });
});
