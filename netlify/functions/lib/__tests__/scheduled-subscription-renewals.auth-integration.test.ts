/**
 * P0-1 — Handler execution path with real scheduler auth and run-mode resolution (no auth mock).
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../subscription-renewal-engine', () => ({
  runRenewalCycle: jest.fn(),
  previewRenewalCycle: jest.fn(),
}));

jest.mock('../subscription-observability', () => ({
  logSubscriptionEvent: jest.fn(),
  runWithSubscriptionObservability: (_ctx: unknown, fn: () => unknown) => fn(),
  SUBSCRIPTION_LOG_EVENTS: {
    SCHEDULER_UNAUTHORIZED: 'scheduler_unauthorized',
    SCHEDULER_DRY_RUN: 'scheduler_dry_run',
    SCHEDULER_MODE_BLOCKED: 'scheduler_mode_blocked',
    SCHEDULER_CYCLE: 'scheduler_cycle',
    SCHEDULER_ERROR: 'scheduler_error',
  },
}));

import { previewRenewalCycle, runRenewalCycle } from '../subscription-renewal-engine';
import { logSubscriptionEvent } from '../subscription-observability';
import { handler } from '../../scheduled-subscription-renewals';

const mockedRunCycle = runRenewalCycle as jest.MockedFunction<typeof runRenewalCycle>;
const mockedPreview = previewRenewalCycle as jest.MockedFunction<typeof previewRenewalCycle>;
const mockedLog = logSubscriptionEvent as jest.MockedFunction<typeof logSubscriptionEvent>;

const ENV_KEYS = [
  'SUBSCRIPTION_CRON_SECRET',
  'SUBSCRIPTION_SCHEDULER_DRY_RUN',
  'SUBSCRIPTION_SCHEDULER_LIVE',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const SECRET = 'cron-secret-under-test';

function scheduledBody(nextRun = new Date().toISOString()): string {
  return JSON.stringify({ next_run: nextRun });
}

function platformScheduleEvent() {
  return {
    body: scheduledBody(),
    headers: { 'x-nf-event': 'schedule', 'user-agent': 'Netlify Clockwork' },
    httpMethod: 'POST',
  } as any;
}

function bearerEvent(token: string) {
  return {
    body: scheduledBody(),
    headers: { authorization: `Bearer ${token}` },
    httpMethod: 'POST',
  } as any;
}

function invoke(event: any) {
  return handler(event, {} as any);
}

function expectNothingRan(): void {
  expect(mockedRunCycle).not.toHaveBeenCalled();
  expect(mockedPreview).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
  mockedRunCycle.mockResolvedValue({
    chargesAttempted: 0,
    chargesSkipped: 0,
    periodsEnded: 0,
    errors: 0,
  });
  mockedPreview.mockResolvedValue({ autoRenewEnabled: true, periodsEndedDue: 0, chargesDue: 2 });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe('authorization (mode flags never bypass auth)', () => {
  test('no SUBSCRIPTION_CRON_SECRET → 401, neither cycle nor preview', async () => {
    process.env.SUBSCRIPTION_SCHEDULER_LIVE = 'true';

    const response = await invoke(platformScheduleEvent());

    expect(response?.statusCode).toBe(401);
    expectNothingRan();
    expect(mockedLog).toHaveBeenCalledWith(
      'scheduler_unauthorized',
      expect.objectContaining({
        secretConfigured: false,
        platformScheduleHeader: true,
        clockworkUserAgent: true,
        nextRunPayload: true,
        credentialHeaderPresent: false,
        httpMethod: 'POST',
        liveFlag: 'true',
      }),
      'error'
    );
  });

  test('wrong secret → 401, neither cycle nor preview', async () => {
    process.env.SUBSCRIPTION_CRON_SECRET = SECRET;
    process.env.SUBSCRIPTION_SCHEDULER_LIVE = 'true';

    const response = await invoke(bearerEvent('wrong-secret'));

    expect(response?.statusCode).toBe(401);
    expectNothingRan();
  });

  test('anonymous forged scheduled payload → 401', async () => {
    process.env.SUBSCRIPTION_CRON_SECRET = SECRET;
    process.env.SUBSCRIPTION_SCHEDULER_LIVE = 'true';

    const response = await invoke({ body: scheduledBody(), headers: {}, httpMethod: 'POST' });

    expect(response?.statusCode).toBe(401);
    expectNothingRan();
  });

  test('plain HTTP with dry-run on and no credentials → 401, no preview', async () => {
    process.env.SUBSCRIPTION_CRON_SECRET = SECRET;
    process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN = 'true';

    const response = await invoke({ body: null, headers: {}, httpMethod: 'GET' });

    expect(response?.statusCode).toBe(401);
    expectNothingRan();
  });
});

describe('run mode after successful authorization', () => {
  beforeEach(() => {
    process.env.SUBSCRIPTION_CRON_SECRET = SECRET;
  });

  test('both mode flags unset → blocked, no real cycle and no preview', async () => {
    const response = await invoke(platformScheduleEvent());

    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(String(response?.body))).toEqual({
      success: true,
      mode: 'blocked',
      reason: 'live_flag_unset',
    });
    expectNothingRan();
    expect(mockedLog).toHaveBeenCalledWith(
      'scheduler_mode_blocked',
      expect.objectContaining({
        reason: 'live_flag_unset',
        liveFlag: 'unset',
        dryRunFlag: 'unset',
        secretConfigured: true,
      }),
      'warn'
    );
  });

  test('valid Bearer secret alone does not select live mode', async () => {
    const response = await invoke(bearerEvent(SECRET));

    expect(JSON.parse(String(response?.body))).toMatchObject({ mode: 'blocked' });
    expectNothingRan();
  });

  test('SUBSCRIPTION_SCHEDULER_DRY_RUN=true → preview only', async () => {
    process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN = 'true';

    const response = await invoke(platformScheduleEvent());

    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(String(response?.body))).toEqual({
      success: true,
      mode: 'dry_run',
      dryRun: true,
      autoRenewEnabled: true,
      periodsEndedDue: 0,
      chargesDue: 2,
    });
    expect(mockedPreview).toHaveBeenCalledTimes(1);
    expect(mockedRunCycle).not.toHaveBeenCalled();
    expect(mockedLog).toHaveBeenCalledWith(
      'scheduler_dry_run',
      expect.objectContaining({ chargesDue: 2, platformScheduleHeader: true, dryRunFlag: 'true' })
    );
  });

  test('dry-run wins when SUBSCRIPTION_SCHEDULER_LIVE=true is also set', async () => {
    process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN = 'true';
    process.env.SUBSCRIPTION_SCHEDULER_LIVE = 'true';

    const response = await invoke(platformScheduleEvent());

    expect(JSON.parse(String(response?.body))).toMatchObject({ mode: 'dry_run' });
    expect(mockedPreview).toHaveBeenCalledTimes(1);
    expect(mockedRunCycle).not.toHaveBeenCalled();
  });

  test('SUBSCRIPTION_SCHEDULER_LIVE=true and dry-run off → real cycle exactly once', async () => {
    process.env.SUBSCRIPTION_SCHEDULER_LIVE = 'true';

    const response = await invoke(platformScheduleEvent());

    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(String(response?.body))).toMatchObject({ success: true, mode: 'live' });
    expect(mockedRunCycle).toHaveBeenCalledTimes(1);
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  test('SUBSCRIPTION_SCHEDULER_LIVE=true with explicit DRY_RUN=false → real cycle once', async () => {
    process.env.SUBSCRIPTION_SCHEDULER_LIVE = 'true';
    process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN = 'false';

    await invoke(bearerEvent(SECRET));

    expect(mockedRunCycle).toHaveBeenCalledTimes(1);
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  test.each(['1', 'yes', '', ' ', 'ture', 'TRUE', ' true', 'true ', 'on', 'false'])(
    'SUBSCRIPTION_SCHEDULER_LIVE=%p → no real cycle',
    async (value) => {
      process.env.SUBSCRIPTION_SCHEDULER_LIVE = value;

      const response = await invoke(platformScheduleEvent());

      expect(JSON.parse(String(response?.body))).toMatchObject({ mode: 'blocked' });
      expectNothingRan();
    }
  );

  test.each(['1', 'yes', 'ture', 'on'])(
    'invalid SUBSCRIPTION_SCHEDULER_DRY_RUN=%p blocks even with LIVE=true',
    async (value) => {
      process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN = value;
      process.env.SUBSCRIPTION_SCHEDULER_LIVE = 'true';

      const response = await invoke(platformScheduleEvent());

      expect(JSON.parse(String(response?.body))).toEqual({
        success: true,
        mode: 'blocked',
        reason: 'dry_run_flag_invalid',
      });
      expectNothingRan();
    }
  );

  test('preview failure → 500 and never falls through to the real cycle', async () => {
    process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN = 'true';
    process.env.SUBSCRIPTION_SCHEDULER_LIVE = 'true';
    mockedPreview.mockRejectedValueOnce(new Error('db unavailable'));

    const response = await invoke(platformScheduleEvent());

    expect(response?.statusCode).toBe(500);
    expect(mockedPreview).toHaveBeenCalledTimes(1);
    expect(mockedRunCycle).not.toHaveBeenCalled();
    expect(mockedLog).toHaveBeenCalledWith(
      'scheduler_error',
      expect.objectContaining({ mode: 'dry_run' }),
      'error'
    );
  });
});

describe('diagnostic logs never leak secrets', () => {
  test.each([
    ['unauthorized (wrong token)', { live: 'true', dryRun: undefined, token: 'leaked-token-xyz' }],
    ['blocked', { live: 'yes', dryRun: undefined, token: SECRET }],
    ['dry run', { live: undefined, dryRun: 'true', token: SECRET }],
    ['live', { live: 'true', dryRun: undefined, token: SECRET }],
  ])('%s', async (_label, { live, dryRun, token }) => {
    process.env.SUBSCRIPTION_CRON_SECRET = SECRET;
    if (live !== undefined) process.env.SUBSCRIPTION_SCHEDULER_LIVE = live;
    if (dryRun !== undefined) process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN = dryRun;

    const event = bearerEvent(token);
    event.headers['x-subscription-cron-secret'] = 'header-secret-value';
    event.headers.cookie = 'session=cookie-value';
    await invoke(event);

    const logged = JSON.stringify(mockedLog.mock.calls);
    expect(mockedLog).toHaveBeenCalled();
    for (const sensitive of [SECRET, token, 'header-secret-value', 'cookie-value', 'Bearer']) {
      expect(logged).not.toContain(sensitive);
    }
  });
});
