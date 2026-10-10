/**
 * Local billing tooling must never write to a non-local Postgres; no env flag overrides this.
 */

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import {
  assertLocalDatabaseForScript,
  getLocalDatabaseBlockReason,
  resolveDatabaseUrlHost,
} from '../local-database-guard';

const PRODUCTION_URL =
  'postgresql://postgres.abc:topsecret@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';
const ENV_KEYS = [
  'DATABASE_URL',
  'DEV_PAYMENT_MODE',
  'ALLOW_LOCAL_SCHEDULER_ON_PRODUCTION_DB',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe('getLocalDatabaseBlockReason', () => {
  test('blocks production Supabase pooler', () => {
    expect(getLocalDatabaseBlockReason(PRODUCTION_URL)).toMatch(/is not a local database/);
  });

  test.each([
    'postgresql://app:pw@localhost:5432/app',
    'postgres://app:pw@127.0.0.1:5432/app',
    'postgresql://app:pw@host.docker.internal:5432/app',
    'postgresql://app:pw@postgres:5432/app',
    'postgresql://app:pw@db.local:5432/app',
    'POSTGRESQL://app:pw@LOCALHOST:5432/app',
  ])('allows local database %s', (url) => {
    expect(getLocalDatabaseBlockReason(url)).toBeNull();
  });

  test.each([
    ['unset', undefined],
    ['empty', '   '],
    ['unknown remote host', 'postgresql://u:p@db.example.com:5432/app'],
    ['localhost lookalike', 'postgresql://u:p@localhost.attacker.com:5432/app'],
    ['host override query param', 'postgresql://u:p@localhost:5432/app?host=prod.supabase.co'],
    ['hostaddr override query param', 'postgresql://u:p@localhost:5432/app?hostaddr=10.0.0.5'],
    ['empty host (PGHOST fallback)', 'postgresql:///app'],
    ['unix socket path', '/var/run/postgresql app'],
    ['socket: protocol', 'socket:/var/run/postgresql?db=app'],
    ['non-postgres scheme', 'mysql://u:p@localhost/app'],
    ['garbage', 'not a url at all'],
  ])('blocks unknown or unverifiable environment: %s', (_label, url) => {
    expect(getLocalDatabaseBlockReason(url)).not.toBeNull();
  });

  test('reads process.env.DATABASE_URL by default', () => {
    process.env.DATABASE_URL = PRODUCTION_URL;
    expect(getLocalDatabaseBlockReason()).not.toBeNull();
    process.env.DATABASE_URL = 'postgresql://app:pw@localhost:5432/app';
    expect(getLocalDatabaseBlockReason()).toBeNull();
  });

  test('reason never contains credentials', () => {
    const reason = getLocalDatabaseBlockReason(PRODUCTION_URL) ?? '';
    expect(reason).not.toContain('topsecret');
    expect(reason).not.toContain('postgres.abc');
  });
});

describe('resolveDatabaseUrlHost', () => {
  test('returns the host pg connects to', () => {
    expect(resolveDatabaseUrlHost('postgresql://u:p@127.0.0.1:5432/db')).toEqual({
      host: '127.0.0.1',
    });
  });

  test('does not trust a host hidden in the userinfo', () => {
    expect(
      resolveDatabaseUrlHost('postgresql://u:p@localhost@aws-1.pooler.supabase.com:6543/postgres')
    ).toEqual({ host: 'aws-1.pooler.supabase.com' });
  });
});

describe('assertLocalDatabaseForScript', () => {
  test('throws for production DB', () => {
    process.env.DATABASE_URL = PRODUCTION_URL;
    expect(() => assertLocalDatabaseForScript('verify:autorenew')).toThrow(
      /verify:autorenew refuses to run/
    );
  });

  test('DEV_PAYMENT_MODE=true does not bypass', () => {
    process.env.DATABASE_URL = PRODUCTION_URL;
    process.env.DEV_PAYMENT_MODE = 'true';
    expect(() => assertLocalDatabaseForScript('seed:autorenew-ui')).toThrow(/refuses to run/);
  });

  test('ALLOW_LOCAL_SCHEDULER_ON_PRODUCTION_DB=true does not bypass', () => {
    process.env.DATABASE_URL = PRODUCTION_URL;
    process.env.ALLOW_LOCAL_SCHEDULER_ON_PRODUCTION_DB = 'true';
    expect(() => assertLocalDatabaseForScript('seed:autorenew-ui')).toThrow(/refuses to run/);
  });

  test('passes for local DB', () => {
    process.env.DATABASE_URL = 'postgresql://app:pw@localhost:5432/app';
    expect(() => assertLocalDatabaseForScript('verify:autorenew')).not.toThrow();
  });

  test('error message never contains credentials', () => {
    process.env.DATABASE_URL = PRODUCTION_URL;
    expect(() => assertLocalDatabaseForScript('x')).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('topsecret') })
    );
  });
});
