/**
 * PR-10.1 — scheduled-subscription-renewals handler auth (C-2).
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../subscription-renewal-scheduler-auth', () => ({
  authorizeScheduledRenewalInvocation: jest.fn(),
  describeSchedulerInvocation: jest.fn(() => ({})),
}));

jest.mock('../subscription-renewal-engine', () => ({
  runRenewalCycle: jest.fn(),
  previewRenewalCycle: jest.fn(),
}));

import { authorizeScheduledRenewalInvocation } from '../subscription-renewal-scheduler-auth';
import { runRenewalCycle } from '../subscription-renewal-engine';
import { handler } from '../../scheduled-subscription-renewals';

const mockedAuthorize = authorizeScheduledRenewalInvocation as jest.MockedFunction<
  typeof authorizeScheduledRenewalInvocation
>;
const mockedRunCycle = runRenewalCycle as jest.MockedFunction<typeof runRenewalCycle>;

const ORIGINAL_LIVE = process.env.SUBSCRIPTION_SCHEDULER_LIVE;
const ORIGINAL_DRY_RUN = process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SUBSCRIPTION_SCHEDULER_LIVE;
  delete process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN;
});

afterEach(() => {
  if (ORIGINAL_LIVE === undefined) delete process.env.SUBSCRIPTION_SCHEDULER_LIVE;
  else process.env.SUBSCRIPTION_SCHEDULER_LIVE = ORIGINAL_LIVE;
  if (ORIGINAL_DRY_RUN === undefined) delete process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN;
  else process.env.SUBSCRIPTION_SCHEDULER_DRY_RUN = ORIGINAL_DRY_RUN;
});

describe('scheduled-subscription-renewals handler', () => {
  test('returns 401 when unauthorized', async () => {
    mockedAuthorize.mockReturnValue(false);

    const response = await handler({ body: null, headers: {} } as any, {} as any);

    expect(response?.statusCode).toBe(401);
    expect(mockedRunCycle).not.toHaveBeenCalled();
  });

  test('authorized without SUBSCRIPTION_SCHEDULER_LIVE → blocked, cycle not called', async () => {
    mockedAuthorize.mockReturnValue(true);

    const response = await handler({ body: null, headers: {} } as any, {} as any);

    expect(response?.statusCode).toBe(200);
    expect(JSON.parse(String(response?.body))).toMatchObject({ mode: 'blocked' });
    expect(mockedRunCycle).not.toHaveBeenCalled();
  });

  test('runs renewal cycle when authorized and SUBSCRIPTION_SCHEDULER_LIVE=true', async () => {
    mockedAuthorize.mockReturnValue(true);
    process.env.SUBSCRIPTION_SCHEDULER_LIVE = 'true';
    mockedRunCycle.mockResolvedValue({
      chargesAttempted: 1,
      chargesSkipped: 0,
      periodsEnded: 0,
      errors: 0,
    });

    const response = await handler(
      { body: JSON.stringify({ next_run: new Date().toISOString() }), headers: {} } as any,
      {} as any
    );

    expect(response?.statusCode).toBe(200);
    expect(mockedRunCycle).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(response?.body))).toMatchObject({
      success: true,
      chargesAttempted: 1,
    });
  });
});
