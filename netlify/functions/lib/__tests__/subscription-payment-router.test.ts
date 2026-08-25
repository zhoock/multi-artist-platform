/**
 * Unit tests for payment router billing_origin guard.
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../subscriptions', () => ({
  getViewerSubscription: jest.fn(),
}));

jest.mock('../subscription-fulfillment', () => ({
  isInitialSubscriptionPaymentKind: jest.fn(
    (kind: string | null | undefined) => kind === 'initial'
  ),
  processInitialSubscriptionProviderPayment: jest.fn(async () => ({
    subscriptionActivated: true,
    alreadyFulfilled: false,
    planSlug: 'explorer',
  })),
}));

jest.mock('../subscription-renewal-fulfillment', () => ({
  isRenewalSubscriptionPaymentKind: jest.fn(
    (kind: string | null | undefined) => kind === 'renewal'
  ),
  processRenewalSubscriptionProviderPayment: jest.fn(async () => ({
    subscriptionRenewed: true,
    alreadyFulfilled: false,
    planSlug: 'explorer',
  })),
}));

jest.mock('../subscription-upgrade-fulfillment', () => ({
  isUpgradeSubscriptionPaymentKind: jest.fn(() => false),
  processUpgradeSubscriptionProviderPayment: jest.fn(),
}));

jest.mock('../subscription-rebind-fulfillment', () => ({
  isRebindSubscriptionPaymentKind: jest.fn(() => false),
  processRebindSubscriptionProviderPayment: jest.fn(),
}));

import { getViewerSubscription } from '../subscriptions';
import { processSubscriptionProviderPaymentForRow } from '../subscription-payment-router';
import { processRenewalSubscriptionProviderPayment } from '../subscription-renewal-fulfillment';
import { processInitialSubscriptionProviderPayment } from '../subscription-fulfillment';

const mockedGetSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;
const mockedRenewal = processRenewalSubscriptionProviderPayment as jest.MockedFunction<
  typeof processRenewalSubscriptionProviderPayment
>;
const mockedInitial = processInitialSubscriptionProviderPayment as jest.MockedFunction<
  typeof processInitialSubscriptionProviderPayment
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const renewalPayment = {
  id: 'pay-renewal-1',
  status: 'succeeded' as const,
  amount: { value: '1.00', currency: 'RUB' },
  metadata: {
    productType: 'premium_subscription',
    userId: USER_ID,
    plan: 'explorer',
    kind: 'renewal',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NETLIFY_DEV = 'true';
  process.env.NODE_ENV = 'test';
});

describe('processSubscriptionProviderPaymentForRow billing_origin guard', () => {
  test('dev runtime skips production subscription renewal (production → dev)', async () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    mockedGetSubscription.mockResolvedValue({
      id: 'sub-1',
      userId: USER_ID,
      status: 'active',
      plan: 'explorer',
      slotsLimit: 20,
      provider: 'yookassa',
      providerSubscriptionId: 'pay-old',
      startedAt: new Date(),
      expiresAt: new Date(),
      billingOrigin: 'production',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processSubscriptionProviderPaymentForRow(
      renewalPayment,
      USER_ID,
      'renewal',
      { observabilitySource: 'scheduler' }
    );

    expect(result).toEqual({
      subscriptionRenewed: false,
      alreadyFulfilled: false,
      planSlug: 'explorer',
    });
    expect(mockedRenewal).not.toHaveBeenCalled();
  });

  test('production runtime skips dev subscription initial (dev → production)', async () => {
    delete process.env.DEV_PAYMENT_MODE;
    mockedGetSubscription.mockResolvedValue({
      id: 'sub-dev',
      userId: USER_ID,
      status: 'active',
      plan: 'explorer',
      slotsLimit: 20,
      provider: 'yookassa',
      providerSubscriptionId: 'pay-dev',
      startedAt: new Date(),
      expiresAt: new Date(),
      billingOrigin: 'dev',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processSubscriptionProviderPaymentForRow(
      {
        ...renewalPayment,
        id: 'pay-initial-1',
        metadata: { ...renewalPayment.metadata, kind: 'initial' },
      },
      USER_ID,
      'initial',
      { observabilitySource: 'webhook' }
    );

    expect(result).toEqual({
      subscriptionActivated: false,
      alreadyFulfilled: false,
      planSlug: 'explorer',
    });
    expect(mockedInitial).not.toHaveBeenCalled();
  });
});
