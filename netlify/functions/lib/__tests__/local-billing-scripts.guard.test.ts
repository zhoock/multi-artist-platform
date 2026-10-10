/**
 * Loads the real local billing scripts with every DB / payment / renewal dependency mocked and
 * asserts the production-DB guard fires before the first write, payment or renewal call.
 * dotenv is mocked so the developer's .env (which may point at production) is never read.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { join } from 'node:path';

const mockQuery = jest.fn(async (..._args: unknown[]): Promise<never> => {
  throw new Error('stop: db query reached');
});

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  isMissingRelationError: jest.fn(() => false),
}));
jest.mock('../complete-dev-payment');
jest.mock('../subscription-billing');
jest.mock('../subscription-provider-payment');
jest.mock('../subscription-payment-router');
jest.mock('../subscriptions');
jest.mock('../subscription-renewal-engine');
jest.mock('../subscription-renewal-fulfillment');
jest.mock('../archive');
jest.mock('../subscription-access');
jest.mock('../subscription-billing-snapshot');
jest.mock('../local-renewal-scheduler', () => ({
  ...(jest.requireActual('../local-renewal-scheduler') as object),
  runLocalRenewalCycleTick: jest.fn(),
}));

const SCRIPTS_DIR = join(__dirname, '../../../../scripts');

const GUARDED_SCRIPTS: Array<[scriptName: string, file: string]> = [
  ['verify:autorenew', 'verify-autorenew-cycle.ts'],
  ['seed:autorenew-ui', 'seed-autorenew-ui-proof.ts'],
  ['diagnose-collection-lock-renewal', 'diagnose-collection-lock-renewal.ts'],
  ['verify-collection-lock-active-sub-local', 'verify-collection-lock-active-sub-local.ts'],
  ['verify-collection-lock-expiry-local', 'verify-collection-lock-expiry-local.ts'],
  ['verify-renewal-preserves-lock-snapshot', 'verify-renewal-preserves-lock-snapshot.ts'],
];

const PRODUCTION_URL =
  'postgresql://postgres.abc:topsecret@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';
const LOCAL_URL = 'postgresql://app:pw@localhost:5432/app';

const ENV_KEYS = [
  'DATABASE_URL',
  'DEV_PAYMENT_MODE',
  'ALLOW_LOCAL_SCHEDULER_ON_PRODUCTION_DB',
  'NETLIFY_DEV',
  'NODE_ENV',
  'CONTEXT',
  'SUBSCRIPTION_AUTO_RENEW_ENABLED',
  'LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let exitSpy: jest.SpiedFunction<typeof process.exit>;
let errorSpy: jest.SpiedFunction<typeof console.error>;

/** Every mocked side-effecting dependency the scripts can reach. */
function writeCalls(): Record<string, number> {
  const billing = jest.requireMock('../subscription-billing') as Record<string, jest.Mock>;
  const devPayment = jest.requireMock('../complete-dev-payment') as Record<string, jest.Mock>;
  const engine = jest.requireMock('../subscription-renewal-engine') as Record<string, jest.Mock>;
  const archive = jest.requireMock('../archive') as Record<string, jest.Mock>;
  const fulfillment = jest.requireMock('../subscription-renewal-fulfillment') as Record<
    string,
    jest.Mock
  >;
  const router = jest.requireMock('../subscription-payment-router') as Record<string, jest.Mock>;
  return {
    query: mockQuery.mock.calls.length,
    createPendingSubscriptionPayment: billing.createPendingSubscriptionPayment.mock.calls.length,
    attachDevSucceededSubscriptionCheckout:
      devPayment.attachDevSucceededSubscriptionCheckout.mock.calls.length,
    processSubscriptionProviderPaymentForRow:
      router.processSubscriptionProviderPaymentForRow.mock.calls.length,
    attemptRenewalChargeForSubscription:
      engine.attemptRenewalChargeForSubscription.mock.calls.length,
    runRenewalCycle: engine.runRenewalCycle.mock.calls.length,
    addArtistToArchive: archive.addArtistToArchive.mock.calls.length,
    applyRenewalArchiveSideEffects: fulfillment.applyRenewalArchiveSideEffects.mock.calls.length,
  };
}

function totalWrites(): number {
  return Object.values(writeCalls()).reduce((sum, n) => sum + n, 0);
}

/** Fresh registry per run; requireMock below then returns the same instances the script got. */
async function runScript(file: string): Promise<void> {
  jest.resetModules();
  require(join(SCRIPTS_DIR, file));
  for (let i = 0; i < 300 && exitSpy.mock.calls.length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(exitSpy).toHaveBeenCalledWith(1);
}

function loggedErrors(): string {
  return errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
  exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of ENV_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe.each(GUARDED_SCRIPTS)('%s (%s)', (scriptName, file) => {
  test('production DB → refuses before any write, payment or renewal', async () => {
    process.env.DATABASE_URL = PRODUCTION_URL;

    await runScript(file);

    expect(loggedErrors()).toContain(`${scriptName} refuses to run`);
    expect(totalWrites()).toBe(0);
    expect(loggedErrors()).not.toContain('topsecret');
  });

  test('DEV_PAYMENT_MODE=true + removed ALLOW_LOCAL_SCHEDULER_ON_PRODUCTION_DB=true do not bypass', async () => {
    process.env.DATABASE_URL = PRODUCTION_URL;
    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.ALLOW_LOCAL_SCHEDULER_ON_PRODUCTION_DB = 'true';

    await runScript(file);

    expect(loggedErrors()).toContain(`${scriptName} refuses to run`);
    expect(totalWrites()).toBe(0);
  });

  test('unrecognised environment (DATABASE_URL unset) → refuses', async () => {
    await runScript(file);

    expect(loggedErrors()).toContain(`${scriptName} refuses to run`);
    expect(totalWrites()).toBe(0);
  });

  test('host override via ?host= → refuses', async () => {
    process.env.DATABASE_URL = `${LOCAL_URL}?host=aws-1-ap-south-1.pooler.supabase.com`;

    await runScript(file);

    expect(loggedErrors()).toContain(`${scriptName} refuses to run`);
    expect(totalWrites()).toBe(0);
  });

  test('local DB → guard passes and the script proceeds to its first DB step', async () => {
    process.env.DATABASE_URL = LOCAL_URL;

    await runScript(file);

    expect(loggedErrors()).not.toContain('refuses to run');
    expect(totalWrites()).toBeGreaterThan(0);
  });
});

describe('dev:scheduler sidecar (scripts/dev-subscription-scheduler-tick.ts)', () => {
  function tickCalls(): number {
    const scheduler = jest.requireMock('../local-renewal-scheduler') as Record<string, jest.Mock>;
    return scheduler.runLocalRenewalCycleTick.mock.calls.length;
  }

  test.each([
    ['removed bypass flag set to "true"', 'true'],
    ['flag unset', undefined],
    ['flag "TRUE"', 'TRUE'],
    ['flag "1"', '1'],
  ])('production DB with %s → exits before any renewal tick', async (_label, allow) => {
    process.env.NETLIFY_DEV = 'true';
    process.env.DATABASE_URL = PRODUCTION_URL;
    process.env.DEV_PAYMENT_MODE = 'true';
    if (allow !== undefined) process.env.ALLOW_LOCAL_SCHEDULER_ON_PRODUCTION_DB = allow;

    await runScript('dev-subscription-scheduler-tick.ts');

    expect(loggedErrors()).toContain('Local renewal scheduler refuses remote DATABASE_URL');
    expect(tickCalls()).toBe(0);
    expect(totalWrites()).toBe(0);
    expect(loggedErrors()).not.toContain('topsecret');
  });

  test('local DB → sidecar starts and runs a renewal tick', async () => {
    const realSetTimeout = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      const timer = realSetTimeout(fn, ms) as unknown as { unref?: () => void };
      timer.unref?.();
      return timer;
    }) as typeof setTimeout);
    process.env.NETLIFY_DEV = 'true';
    process.env.DATABASE_URL = LOCAL_URL;
    process.env.LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS = '3600000';
    mockQuery.mockImplementationOnce(async () => ({ rows: [] }) as never);

    jest.resetModules();
    require(join(SCRIPTS_DIR, 'dev-subscription-scheduler-tick.ts'));
    for (let i = 0; i < 300 && tickCalls() === 0; i += 1) {
      await new Promise((resolve) => realSetTimeout(resolve, 10));
    }

    expect(loggedErrors()).not.toContain('refuses');
    expect(tickCalls()).toBe(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
