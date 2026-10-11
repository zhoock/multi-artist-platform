import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('../subscription-feature-flag', () => ({
  isSubscriptionAutoRenewEnabled: jest.fn(() => true),
}));

jest.mock('../subscription-renewal-scheduler-mode', () => ({
  resolveSchedulerRunMode: jest.fn(() => ({ mode: 'live' as const })),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
}));

jest.mock('../subscription-renewal-engine', () => ({
  listChargeReadySubscriptionIds: jest.fn(),
  reconcileRenewalClaimBlockers: jest.fn(),
  attemptRenewalChargeForSubscription: jest.fn(),
}));

import { nudgeRenewalChargeIfDueForUser } from '../subscription-renewal-nudge';
import {
  attemptRenewalChargeForSubscription,
  listChargeReadySubscriptionIds,
} from '../subscription-renewal-engine';
import { getViewerSubscription } from '../subscriptions';

const mockedGetSub = getViewerSubscription as jest.MockedFunction<typeof getViewerSubscription>;
const mockedList = listChargeReadySubscriptionIds as jest.MockedFunction<
  typeof listChargeReadySubscriptionIds
>;
const mockedAttempt = attemptRenewalChargeForSubscription as jest.MockedFunction<
  typeof attemptRenewalChargeForSubscription
>;

describe('nudgeRenewalChargeIfDueForUser', () => {
  beforeEach(() => {
    mockedGetSub.mockReset();
    mockedList.mockReset();
    mockedAttempt.mockReset();
  });

  test('attempts charge when subscription is charge-ready', async () => {
    mockedGetSub.mockResolvedValue({ id: 'sub-1' } as never);
    mockedList.mockResolvedValue(['sub-1']);
    mockedAttempt.mockResolvedValue('attempted');

    await nudgeRenewalChargeIfDueForUser('user-1', new Date('2026-08-07T12:05:00.000Z'));

    expect(mockedAttempt).toHaveBeenCalledWith('sub-1', expect.any(Date));
  });

  test('skips when subscription is not charge-ready', async () => {
    mockedGetSub.mockResolvedValue({ id: 'sub-1' } as never);
    mockedList.mockResolvedValue([]);

    await nudgeRenewalChargeIfDueForUser('user-1');

    expect(mockedAttempt).not.toHaveBeenCalled();
  });
});
