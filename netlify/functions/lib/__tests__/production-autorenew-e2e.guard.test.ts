/**
 * scripts/prod-autorenew-e2e-proof.ts must refuse before register / checkout / payments / SQL writes
 * unless the operator explicitly opts in AND confirms a consistent production target.
 * fetch, db, fs, YooKassa helpers and dotenv are mocked — nothing leaves the process.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { join } from 'node:path';

import {
  assertYooKassaPaymentTestMode,
  checkProductionAutorenewE2eEnvironment,
  PRODUCTION_AUTORENEW_E2E_FORBIDDEN_OUTPUT_KEYS,
  validateProductionAutorenewE2eBaseUrl,
} from '../production-autorenew-e2e-guard';

const mockQuery = jest.fn(async (..._args: unknown[]): Promise<any> => ({ rows: [] }));
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  isMissingRelationError: jest.fn(() => false),
}));
jest.mock('node:fs', () => ({
  ...(jest.requireActual('node:fs') as object),
  mkdirSync: (...args: unknown[]) => mockMkdir(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFile(...args),
}));
jest.mock('../yookassa-webhook-verify', () => ({
  fetchPaymentFromYooKassaApi: jest.fn(async () => ({
    ok: true,
    payment: {
      test: true,
      status: 'pending',
      save_payment_method: true,
      payment_method: { type: 'bank_card', saved: false, id: 'pm-secret' },
    },
  })),
}));
jest.mock('../yookassa-env', () => ({
  getYooKassaEnvCredentials: jest.fn(() => ({ shopId: 'shop-123', secretKey: 'test_key' })),
}));
jest.mock('../subscription-renewal-engine', () => ({
  listChargeReadySubscriptionIds: jest.fn(async () => []),
}));

const BASE_URL = 'https://staging-example.netlify.app';
const BASE_ORIGIN = BASE_URL;
const DB_HOST = 'aws-1-ap-south-1.pooler.supabase.com';
const SECRETS = ['topsecret', 'test_secret_key_value', 'cron-secret-value', 'shop-123'];

function validEnv(): Record<string, string> {
  return {
    ALLOW_PRODUCTION_AUTORENEW_E2E: 'true',
    PRODUCTION_AUTORENEW_E2E_BASE_URL: BASE_URL,
    PRODUCTION_AUTORENEW_E2E_DATABASE_HOST: DB_HOST,
    DATABASE_URL: `postgresql://postgres.abc:topsecret@${DB_HOST}:6543/postgres`,
    YOOKASSA_SHOP_ID: 'shop-123',
    YOOKASSA_SECRET_KEY: 'test_secret_key_value',
  };
}

function check(env: Record<string, string | undefined>, argv: string[] = []) {
  return checkProductionAutorenewE2eEnvironment({ argv, env });
}

function reasonsOf(result: ReturnType<typeof check>): string {
  return result.ok ? '' : result.reasons.join('\n');
}

describe('validateProductionAutorenewE2eBaseUrl', () => {
  test.each([
    ['unset', undefined, /not set/],
    ['http', 'http://example.com', /https/],
    ['credentials', 'https://user:pass@example.com', /credentials/],
    ['query', 'https://example.com?x=1', /query or hash/],
    ['hash', 'https://example.com#x', /query or hash/],
    ['path', 'https://example.com/app', /path/],
    ['localhost', 'https://localhost', /localhost|local domain|IP/],
    ['127.0.0.1', 'https://127.0.0.1', /localhost|local domain|IP/],
    ['ipv4', 'https://203.0.113.1', /localhost|local domain|IP/],
    ['.local', 'https://db.local', /localhost|local domain|IP/],
  ])('%s → refused', (_label, raw, reason) => {
    const result = validateProductionAutorenewE2eBaseUrl(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  test('normalizes to origin', () => {
    expect(validateProductionAutorenewE2eBaseUrl(`${BASE_URL}/`)).toEqual({
      ok: true,
      origin: BASE_ORIGIN,
    });
  });
});

describe('checkProductionAutorenewE2eEnvironment', () => {
  test('fully consistent opt-in passes', () => {
    expect(check(validEnv())).toEqual({
      ok: true,
      config: {
        baseUrl: BASE_ORIGIN,
        databaseHost: DB_HOST,
        skipPayment: false,
        simulatePeriodEnd: false,
      },
    });
  });

  test.each([undefined, '1', 'yes', 'TRUE', 'True', '', ' true', 'true ', 'ture', 'on'])(
    'opt-in %p is refused',
    (value) => {
      const env: Record<string, string | undefined> = { ...validEnv() };
      env.ALLOW_PRODUCTION_AUTORENEW_E2E = value;
      const result = check(env);
      expect(result.ok).toBe(false);
      expect(reasonsOf(result)).toMatch(/ALLOW_PRODUCTION_AUTORENEW_E2E must be exactly "true"/);
    }
  );

  test.each<[string, Record<string, string | undefined>, string[], RegExp]>([
    ['base URL unset', { PRODUCTION_AUTORENEW_E2E_BASE_URL: undefined }, [], /not set/],
    [
      'invalid base URL',
      { PRODUCTION_AUTORENEW_E2E_BASE_URL: 'https://127.0.0.1' },
      [],
      /localhost|local domain|IP/,
    ],
    ['DATABASE_URL unset', { DATABASE_URL: undefined }, [], /DATABASE_URL is not set/],
    [
      'local DATABASE_URL',
      {
        DATABASE_URL: 'postgresql://app:pw@localhost:5432/app',
        PRODUCTION_AUTORENEW_E2E_DATABASE_HOST: 'localhost',
      },
      [],
      /local database/,
    ],
    [
      'unparseable DATABASE_URL',
      { DATABASE_URL: 'not a url' },
      [],
      /cannot verify DATABASE_URL host/,
    ],
    [
      'host override query param',
      { DATABASE_URL: `postgresql://u:p@${DB_HOST}/db?host=other.example` },
      [],
      /host override/,
    ],
    [
      'DB host not confirmed',
      { PRODUCTION_AUTORENEW_E2E_DATABASE_HOST: undefined },
      [],
      /DATABASE_HOST is not set/,
    ],
    [
      'DB host mismatch',
      { PRODUCTION_AUTORENEW_E2E_DATABASE_HOST: 'db.other.supabase.co' },
      [],
      /does not match/,
    ],
    ['DEV_PAYMENT_MODE=true', { DEV_PAYMENT_MODE: 'true' }, [], /DEV_PAYMENT_MODE must be unset/],
    ['live YooKassa key', { YOOKASSA_SECRET_KEY: 'live_abcdef' }, [], /not a test key/],
    [
      'YooKassa key missing',
      { YOOKASSA_SECRET_KEY: undefined },
      [],
      /YOOKASSA_SHOP_ID \/ YOOKASSA_SECRET_KEY are not set/,
    ],
    ['legacy --skip-renewal flag', {}, ['--skip-renewal'], /unknown arguments/],
    ['typo in flag', {}, ['--skip-renewl'], /unknown arguments/],
    [
      'simulate-period-end with skip-payment',
      {},
      ['--skip-payment', '--simulate-period-end'],
      /cannot be combined with --skip-payment/,
    ],
  ])('opt-in set but %s → refused', (_label, overrides, argv, reason) => {
    const env: Record<string, string | undefined> = { ...validEnv(), ...overrides };
    const result = check(env, argv);
    expect(result.ok).toBe(false);
    expect(reasonsOf(result)).toMatch(reason);
  });

  test('DB host confirmation is case-insensitive but exact', () => {
    expect(
      check({ ...validEnv(), PRODUCTION_AUTORENEW_E2E_DATABASE_HOST: DB_HOST.toUpperCase() }).ok
    ).toBe(true);
    expect(check({ ...validEnv(), PRODUCTION_AUTORENEW_E2E_DATABASE_HOST: `x${DB_HOST}` }).ok).toBe(
      false
    );
  });

  test('reasons never contain secret values', () => {
    const env = {
      ...validEnv(),
      ALLOW_PRODUCTION_AUTORENEW_E2E: 'no',
      YOOKASSA_SECRET_KEY: 'live_topsecret',
    };
    const text = reasonsOf(check(env, ['--leak=topsecret']));
    for (const secret of [...SECRETS, 'live_topsecret', '--leak'])
      expect(text).not.toContain(secret);
  });
});

describe('assertYooKassaPaymentTestMode', () => {
  test('requires test === true when field is present', () => {
    expect(() => assertYooKassaPaymentTestMode({ test: false })).toThrow(/test is not true/);
    expect(() => assertYooKassaPaymentTestMode({ test: true })).not.toThrow();
  });

  test('refuses when test field is absent', () => {
    expect(() => assertYooKassaPaymentTestMode({})).toThrow(/no "test" field/);
  });
});

describe('scripts/prod-autorenew-e2e-proof.ts', () => {
  const SCRIPT = join(__dirname, '../../../../scripts/prod-autorenew-e2e-proof.ts');
  const ENV_KEYS = [...Object.keys(validEnv()), 'DEV_PAYMENT_MODE', 'SUBSCRIPTION_CRON_SECRET'];
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalArgv = process.argv;
  const originalFetch = global.fetch;

  let fetchMock: jest.Mock<(...args: any[]) => Promise<any>>;
  let exitSpy: jest.SpiedFunction<typeof process.exit>;
  let errorSpy: jest.SpiedFunction<typeof console.error>;
  let logSpy: jest.SpiedFunction<typeof console.log>;

  function textResponse(body: string, status = 200) {
    return { status, ok: status < 400, text: async () => body, json: async () => JSON.parse(body) };
  }

  function fetchCalls(): Array<{ url: string; method: string }> {
    return fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: String((init as { method?: string } | undefined)?.method ?? 'GET'),
    }));
  }

  function writeSqlCalls(): string[] {
    return mockQuery.mock.calls
      .map(([sql]) => String(sql).trim())
      .filter((sql) => /^(INSERT|UPDATE|DELETE|TRUNCATE)/i.test(sql));
  }

  function allOutput(): string {
    return [...errorSpy.mock.calls, ...logSpy.mock.calls]
      .map((a) => a.map(String).join(' '))
      .join('\n');
  }

  function artifactBodies(): string {
    return mockWriteFile.mock.calls.map(([, body]) => String(body)).join('\n');
  }

  async function runScriptUntilExit(
    env: Record<string, string | undefined>,
    argv: string[] = [],
    afterResetModules?: () => void
  ) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.argv = ['node', SCRIPT, ...argv];
    jest.resetModules();
    afterResetModules?.();
    require(SCRIPT);
    for (let i = 0; i < 300 && exitSpy.mock.calls.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function runScriptUntilSettled(
    env: Record<string, string | undefined>,
    argv: string[] = [],
    afterResetModules?: () => void
  ) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.argv = ['node', SCRIPT, ...argv];
    jest.resetModules();
    afterResetModules?.();
    require(SCRIPT);
    for (let i = 0; i < 800; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (exitSpy.mock.calls.length > 0) return;
      if (mockWriteFile.mock.calls.some(([path]) => String(path).includes('post-checkout-facts')))
        return;
      if (allOutput().includes('remote scheduler is never invoked')) return;
      if (allOutput().includes('--skip-payment:')) return;
    }
  }

  function expectNoSideEffects(): void {
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    const yk = jest.requireMock('../yookassa-webhook-verify') as Record<string, jest.Mock>;
    expect(yk.fetchPaymentFromYooKassaApi).not.toHaveBeenCalled();
  }

  function expectNoSensitiveOutput(text: string): void {
    for (const secret of [
      ...SECRETS,
      'jwt-token-value',
      'pm-secret',
      'confirmationUrl',
      'ProdAutorenewProof',
      '@pr10-e2e.test',
    ]) {
      expect(text).not.toContain(secret);
    }
    for (const key of PRODUCTION_AUTORENEW_E2E_FORBIDDEN_OUTPUT_KEYS) {
      expect(text).not.toMatch(new RegExp(`"${key}"\\s*:`));
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
    fetchMock = jest.fn(async () => textResponse(''));
    global.fetch = fetchMock as unknown as typeof fetch;
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    process.argv = originalArgv;
    for (const key of ENV_KEYS) {
      const original = originalEnv[key];
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  });

  test('no opt-in → refuses before any network call, file write or SQL', async () => {
    await runScriptUntilExit({ ...validEnv(), ALLOW_PRODUCTION_AUTORENEW_E2E: undefined });

    expect(allOutput()).toContain('prod-autorenew-e2e-proof refuses to run');
    expectNoSideEffects();
  });

  test.each(['1', 'yes', 'TRUE', '', ' true', 'ture'])(
    'opt-in %p → refuses with no side effects',
    async (value) => {
      await runScriptUntilExit({ ...validEnv(), ALLOW_PRODUCTION_AUTORENEW_E2E: value });

      expect(allOutput()).toContain('refuses to run');
      expectNoSideEffects();
    }
  );

  test('valid pre-flight → bundle check only until flag missing; no register, no SQL', async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      const href = String(url);
      if (href.endsWith('/'))
        return textResponse('<script src="/scripts/main.abc123.js"></script>');
      if (href.includes('/scripts/')) return textResponse('// no flag here');
      return textResponse('');
    });

    await runScriptUntilExit(validEnv());

    expect(allOutput()).not.toContain('refuses to run');
    expect(fetchCalls().every((call) => call.method === 'GET')).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(allOutput()).toContain('Client bundle not built with autorenew flag=true');
  });

  test('registered user not visible in DATABASE_URL → aborts before any SQL write or checkout', async () => {
    fetchMock.mockImplementation(async (url: unknown, init?: unknown) => {
      const href = String(url);
      if (href.endsWith('/auth/register')) {
        return textResponse(
          JSON.stringify({
            data: {
              user: { id: '11111111-2222-4333-8444-555555555555' },
              token: 'jwt-token-value',
            },
          }),
          201
        );
      }
      if (href.includes('/scripts/')) return textResponse('parseAutoRenewFlag("true")');
      void init;
      return textResponse('<script src="/scripts/main.js"></script>');
    });
    mockQuery.mockImplementation(async () => ({ rows: [] }));

    await runScriptUntilExit(validEnv());

    expect(allOutput()).toContain('is not visible in DATABASE_URL');
    expect(writeSqlCalls()).toEqual([]);
    expect(fetchCalls().some((call) => call.url.includes('create-subscription-payment'))).toBe(
      false
    );
    expectNoSensitiveOutput(allOutput());
  });

  test('checkout through YooKassa verify never invokes remote scheduler', async () => {
    fetchMock.mockImplementation(async (url: unknown, init?: unknown) => {
      const href = String(url);
      if (href.endsWith('/')) return textResponse('<script src="/scripts/main.js"></script>');
      if (href.includes('/scripts/')) return textResponse('parseAutoRenewFlag("true")');
      if (href.endsWith('/auth/register')) {
        return textResponse(
          JSON.stringify({
            data: {
              user: { id: '11111111-2222-4333-8444-555555555555' },
              token: 'jwt-token-value',
            },
          }),
          201
        );
      }
      if (href.includes('create-subscription-payment')) {
        return textResponse(JSON.stringify({ data: { paymentId: 'pay-secret-id' } }));
      }
      void init;
      return textResponse('{}');
    });

    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT id FROM users')) {
        return { rows: [{ id: '11111111-2222-4333-8444-555555555555' }] };
      }
      return { rows: [] };
    });

    await runScriptUntilSettled(validEnv(), ['--skip-payment']);

    expect(fetchCalls().some((call) => call.url.includes('scheduled-subscription-renewals'))).toBe(
      false
    );
    expect(allOutput()).toContain('--skip-payment:');
    expectNoSensitiveOutput(allOutput());
    expectNoSensitiveOutput(artifactBodies());
  });

  test('full checkout path completes without remote scheduler POST', async () => {
    fetchMock.mockImplementation(async (url: unknown, init?: unknown) => {
      const href = String(url);
      if (href.endsWith('/')) return textResponse('<script src="/scripts/main.js"></script>');
      if (href.includes('/scripts/')) return textResponse('parseAutoRenewFlag("true")');
      if (href.endsWith('/auth/register')) {
        return textResponse(
          JSON.stringify({
            data: {
              user: { id: '11111111-2222-4333-8444-555555555555' },
              token: 'jwt-token-value',
            },
          }),
          201
        );
      }
      if (href.includes('create-subscription-payment')) {
        return textResponse(JSON.stringify({ data: { paymentId: 'pay-secret-id' } }));
      }
      if (href.includes('get-subscription-payment-status')) {
        return textResponse(JSON.stringify({ success: true }));
      }
      if (href.includes('my-archive')) {
        return textResponse(
          JSON.stringify({
            data: { billing: { nextChargeAt: '2026-01-01T00:00:00.000Z', plan: 'explorer' } },
          })
        );
      }
      void init;
      return textResponse('{}');
    });

    mockQuery.mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM users')) {
        return { rows: [{ id: '11111111-2222-4333-8444-555555555555' }] };
      }
      if (text.includes('UPDATE users SET is_email_verified')) return { rows: [] };
      if (text.includes('FROM subscriptions')) {
        return {
          rows: [
            {
              id: 'sub-1',
              status: 'active',
              payment_method_id: 'pm-db-secret',
              next_charge_at: new Date('2026-02-01T00:00:00.000Z'),
              expires_at: new Date('2026-02-01T00:00:00.000Z'),
              plan: 'explorer',
            },
          ],
        };
      }
      return { rows: [] };
    });

    await runScriptUntilSettled(validEnv(), [], () => {
      const yk = jest.requireMock('../yookassa-webhook-verify') as {
        fetchPaymentFromYooKassaApi: jest.Mock;
      };
      yk.fetchPaymentFromYooKassaApi.mockImplementation(async () => ({
        ok: true,
        payment: {
          test: true,
          status: 'succeeded',
          save_payment_method: true,
          payment_method: { type: 'bank_card', saved: true, id: 'pm-secret' },
        },
      }));
    });

    expect(fetchCalls().some((call) => call.url.includes('scheduled-subscription-renewals'))).toBe(
      false
    );
    expect(allOutput()).toContain('remote scheduler is never invoked');
    expectNoSensitiveOutput(allOutput());
    expectNoSensitiveOutput(artifactBodies());
  }, 15_000);

  test('combined --skip-payment and --simulate-period-end → pre-flight refuses with no side effects', async () => {
    await runScriptUntilExit(validEnv(), ['--skip-payment', '--simulate-period-end']);

    expect(allOutput()).toMatch(/cannot be combined with --skip-payment/);
    expectNoSideEffects();
  });

  test('multiple subscriptions for user → aborts before subscription UPDATE', async () => {
    fetchMock.mockImplementation(async (url: unknown, init?: unknown) => {
      const href = String(url);
      if (href.endsWith('/')) return textResponse('<script src="/scripts/main.js"></script>');
      if (href.includes('/scripts/')) return textResponse('parseAutoRenewFlag("true")');
      if (href.endsWith('/auth/register')) {
        return textResponse(
          JSON.stringify({
            data: {
              user: { id: '11111111-2222-4333-8444-555555555555' },
              token: 'jwt-token-value',
            },
          }),
          201
        );
      }
      if (href.includes('create-subscription-payment')) {
        return textResponse(JSON.stringify({ data: { paymentId: 'pay-secret-id' } }));
      }
      if (href.includes('get-subscription-payment-status')) {
        return textResponse(JSON.stringify({ success: true }));
      }
      if (href.includes('my-archive')) {
        return textResponse(
          JSON.stringify({
            data: { billing: { nextChargeAt: '2026-01-01T00:00:00.000Z', plan: 'explorer' } },
          })
        );
      }
      void init;
      return textResponse('{}');
    });

    mockQuery.mockImplementation(async (sql: unknown) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM users')) {
        return { rows: [{ id: '11111111-2222-4333-8444-555555555555' }] };
      }
      if (text.includes('UPDATE users SET is_email_verified')) return { rows: [] };
      if (text.includes('FROM subscriptions')) {
        return {
          rows: [
            {
              id: 'sub-1',
              status: 'active',
              payment_method_id: 'pm-1',
              next_charge_at: new Date('2026-02-01T00:00:00.000Z'),
              expires_at: new Date('2026-02-01T00:00:00.000Z'),
              plan: 'explorer',
            },
            {
              id: 'sub-2',
              status: 'active',
              payment_method_id: 'pm-2',
              next_charge_at: new Date('2026-03-01T00:00:00.000Z'),
              expires_at: new Date('2026-03-01T00:00:00.000Z'),
              plan: 'archivist',
            },
          ],
        };
      }
      return { rows: [] };
    });

    await runScriptUntilSettled(validEnv(), [], () => {
      const yk = jest.requireMock('../yookassa-webhook-verify') as {
        fetchPaymentFromYooKassaApi: jest.Mock;
      };
      yk.fetchPaymentFromYooKassaApi.mockImplementation(async () => ({
        ok: true,
        payment: {
          test: true,
          status: 'succeeded',
          save_payment_method: true,
          payment_method: { type: 'bank_card', saved: true, id: 'pm-secret' },
        },
      }));
    });

    expect(allOutput()).toMatch(/ambiguous subscription UPDATE/);
    expect(
      mockQuery.mock.calls
        .map(([sql]) => String(sql))
        .some((sql) => /UPDATE subscriptions/i.test(sql))
    ).toBe(false);
    expectNoSensitiveOutput(allOutput());
    expectNoSensitiveOutput(artifactBodies());
  }, 15_000);

  test('YooKassa payment without test field → aborts before poll loop', async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      const href = String(url);
      if (href.endsWith('/')) return textResponse('<script src="/scripts/main.js"></script>');
      if (href.includes('/scripts/')) return textResponse('parseAutoRenewFlag("true")');
      if (href.endsWith('/auth/register')) {
        return textResponse(
          JSON.stringify({
            data: {
              user: { id: '11111111-2222-4333-8444-555555555555' },
              token: 'jwt-token-value',
            },
          }),
          201
        );
      }
      if (href.includes('create-subscription-payment')) {
        return textResponse(JSON.stringify({ data: { paymentId: 'pay-1', confirmationUrl: 'x' } }));
      }
      return textResponse('{}');
    });
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT id FROM users')) {
        return { rows: [{ id: '11111111-2222-4333-8444-555555555555' }] };
      }
      return { rows: [] };
    });

    await runScriptUntilExit(validEnv(), [], () => {
      const yk = jest.requireMock('../yookassa-webhook-verify') as {
        fetchPaymentFromYooKassaApi: jest.Mock;
      };
      yk.fetchPaymentFromYooKassaApi.mockImplementation(async () => ({
        ok: true,
        payment: { status: 'pending', save_payment_method: true },
      }));
    });

    const yk = jest.requireMock('../yookassa-webhook-verify') as {
      fetchPaymentFromYooKassaApi: jest.Mock;
    };
    expect(allOutput()).toMatch(/no "test" field/);
    expect(yk.fetchPaymentFromYooKassaApi).toHaveBeenCalledTimes(1);
  });
});
