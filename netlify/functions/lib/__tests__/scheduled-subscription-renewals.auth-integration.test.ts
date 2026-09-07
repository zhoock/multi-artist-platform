/**
 * P0-1 — Handler execution path with real scheduler auth (no auth mock).
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../subscription-renewal-engine', () => ({
  runRenewalCycle: jest.fn(),
}));

jest.mock('../subscription-observability', () => ({
  logSubscriptionEvent: jest.fn(),
  runWithSubscriptionObservability: (_ctx: unknown, fn: () => unknown) => fn(),
  SUBSCRIPTION_LOG_EVENTS: {
    SCHEDULER_UNAUTHORIZED: 'scheduler_unauthorized',
    SCHEDULER_CYCLE: 'scheduler_cycle',
    SCHEDULER_ERROR: 'scheduler_error',
  },
}));

import { runRenewalCycle } from '../subscription-renewal-engine';
import { handler } from '../../scheduled-subscription-renewals';

const mockedRunCycle = runRenewalCycle as jest.MockedFunction<typeof runRenewalCycle>;

const ORIGINAL_SECRET = process.env.SUBSCRIPTION_CRON_SECRET;

function scheduledBody(nextRun = new Date().toISOString()): string {
  return JSON.stringify({ next_run: nextRun });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedRunCycle.mockResolvedValue({
    chargesAttempted: 0,
    chargesSkipped: 0,
    periodsEnded: 0,
    errors: 0,
  });
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.SUBSCRIPTION_CRON_SECRET;
  else process.env.SUBSCRIPTION_CRON_SECRET = ORIGINAL_SECRET;
});

describe('scheduled-subscription-renewals auth integration', () => {
  test('anonymous forged scheduled payload → 401, runRenewalCycle not called', async () => {
    process.env.SUBSCRIPTION_CRON_SECRET = 'production-secret';

    const response = await handler(
      { body: scheduledBody(), headers: {}, httpMethod: 'POST' } as any,
      {} as any
    );

    expect(response?.statusCode).toBe(401);
    expect(mockedRunCycle).not.toHaveBeenCalled();
  });

  test('valid Bearer secret → 200, runRenewalCycle called', async () => {
    process.env.SUBSCRIPTION_CRON_SECRET = 'production-secret';

    const response = await handler(
      {
        body: scheduledBody(),
        headers: { authorization: 'Bearer production-secret' },
        httpMethod: 'POST',
      } as any,
      {} as any
    );

    expect(response?.statusCode).toBe(200);
    expect(mockedRunCycle).toHaveBeenCalledTimes(1);
  });

  test('trusted platform schedule + configured env secret → 200, runRenewalCycle called', async () => {
    process.env.SUBSCRIPTION_CRON_SECRET = 'platform-secret';

    const response = await handler(
      {
        body: scheduledBody(),
        headers: { 'x-nf-event': 'schedule' },
        httpMethod: 'POST',
      } as any,
      {} as any
    );

    expect(response?.statusCode).toBe(200);
    expect(mockedRunCycle).toHaveBeenCalledTimes(1);
  });
});
