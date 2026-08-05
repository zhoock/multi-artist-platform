/**
 * PR-10.1 — scheduled-subscription-renewals handler auth (C-2).
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../subscription-renewal-scheduler-auth', () => ({
  authorizeScheduledRenewalInvocation: jest.fn(),
}));

jest.mock('../subscription-renewal-engine', () => ({
  runRenewalCycle: jest.fn(),
}));

import { authorizeScheduledRenewalInvocation } from '../subscription-renewal-scheduler-auth';
import { runRenewalCycle } from '../subscription-renewal-engine';
import { handler } from '../../scheduled-subscription-renewals';

const mockedAuthorize = authorizeScheduledRenewalInvocation as jest.MockedFunction<
  typeof authorizeScheduledRenewalInvocation
>;
const mockedRunCycle = runRenewalCycle as jest.MockedFunction<typeof runRenewalCycle>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('scheduled-subscription-renewals handler', () => {
  test('returns 401 when unauthorized', async () => {
    mockedAuthorize.mockReturnValue(false);

    const response = await handler({ body: null, headers: {} } as any, {} as any);

    expect(response?.statusCode).toBe(401);
    expect(mockedRunCycle).not.toHaveBeenCalled();
  });

  test('runs renewal cycle when authorized', async () => {
    mockedAuthorize.mockReturnValue(true);
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
