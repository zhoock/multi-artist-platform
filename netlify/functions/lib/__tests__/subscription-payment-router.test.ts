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
  isRebindSubscriptionPaymentKind: jest.fn((kind: string | null | undefined) => kind === 'rebind'),
  processRebindSubscriptionProviderPayment: jest.fn(async () => ({
    paymentMethodUpdated: true,
    alreadyApplied: false,
    staleAfterUnlink: false,
  })),
}));

import { getViewerSubscription } from '../subscriptions';
import { processSubscriptionProviderPaymentForRow } from '../subscription-payment-router';
import { processRenewalSubscriptionProviderPayment } from '../subscription-renewal-fulfillment';
import { processInitialSubscriptionProviderPayment } from '../subscription-fulfillment';
import { processRebindSubscriptionProviderPayment } from '../subscription-rebind-fulfillment';

const mockedGetSubscription = getViewerSubscription as jest.MockedFunction<
  typeof getViewerSubscription
>;
const mockedRenewal = processRenewalSubscriptionProviderPayment as jest.MockedFunction<
  typeof processRenewalSubscriptionProviderPayment
>;
const mockedInitial = processInitialSubscriptionProviderPayment as jest.MockedFunction<
  typeof processInitialSubscriptionProviderPayment
>;
const mockedRebind = processRebindSubscriptionProviderPayment as jest.MockedFunction<
  typeof processRebindSubscriptionProviderPayment
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

  test('production runtime fulfills initial checkout after a dev-origin period ends', async () => {
    delete process.env.DEV_PAYMENT_MODE;
    process.env.NODE_ENV = 'production';
    process.env.CONTEXT = 'production';
    mockedGetSubscription.mockResolvedValue({
      id: 'sub-dev',
      userId: USER_ID,
      status: 'expired',
      plan: 'archivist',
      slotsLimit: 100,
      provider: 'yookassa',
      providerSubscriptionId: 'pay-dev-old',
      startedAt: new Date('2026-10-09T10:00:00.000Z'),
      expiresAt: new Date('2026-10-09T15:45:00.000Z'),
      billingOrigin: 'dev',
      createdAt: new Date('2026-10-09T10:00:00.000Z'),
      updatedAt: new Date('2026-10-09T15:45:00.000Z'),
    });

    const result = await processSubscriptionProviderPaymentForRow(
      {
        id: '325b203f-000f-5000-b000-118c53aaa8d7',
        status: 'succeeded',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'archivist',
          kind: 'initial',
        },
      },
      USER_ID,
      'initial',
      { observabilitySource: 'webhook', devMarkedPayment: false }
    );

    expect(result).toEqual({
      subscriptionActivated: true,
      alreadyFulfilled: false,
      planSlug: 'explorer',
    });
    expect(mockedInitial).toHaveBeenCalledTimes(1);
  });

  test('production runtime still skips dev-marked and renewal payments for an ended dev subscription', async () => {
    delete process.env.DEV_PAYMENT_MODE;
    process.env.NODE_ENV = 'production';
    process.env.CONTEXT = 'production';
    mockedGetSubscription.mockResolvedValue({
      id: 'sub-dev',
      userId: USER_ID,
      status: 'expired',
      plan: 'archivist',
      slotsLimit: 100,
      provider: 'yookassa',
      providerSubscriptionId: 'pay-dev-old',
      startedAt: new Date('2026-10-09T10:00:00.000Z'),
      expiresAt: new Date('2026-10-09T15:45:00.000Z'),
      billingOrigin: 'dev',
      createdAt: new Date('2026-10-09T10:00:00.000Z'),
      updatedAt: new Date('2026-10-09T15:45:00.000Z'),
    });

    const devMarked = await processSubscriptionProviderPaymentForRow(
      {
        ...renewalPayment,
        id: 'pay-dev-marked',
        metadata: { ...renewalPayment.metadata, kind: 'initial', plan: 'archivist' },
      },
      USER_ID,
      'initial',
      { observabilitySource: 'poll', devMarkedPayment: true }
    );
    const renewal = await processSubscriptionProviderPaymentForRow(
      renewalPayment,
      USER_ID,
      'renewal',
      { observabilitySource: 'webhook', devMarkedPayment: false }
    );

    expect(devMarked).toMatchObject({ subscriptionActivated: false, alreadyFulfilled: false });
    expect(renewal).toMatchObject({ subscriptionRenewed: false, alreadyFulfilled: false });
    expect(mockedInitial).not.toHaveBeenCalled();
    expect(mockedRenewal).not.toHaveBeenCalled();
  });

  test('production runtime fulfills rebind for a dev-origin subscription', async () => {
    delete process.env.DEV_PAYMENT_MODE;
    process.env.NODE_ENV = 'production';
    process.env.CONTEXT = 'production';
    mockedGetSubscription.mockResolvedValue({
      id: 'sub-dev',
      userId: USER_ID,
      status: 'expired',
      plan: 'archivist',
      slotsLimit: 100,
      provider: 'yookassa',
      providerSubscriptionId: '325b203f-000f-5000-b000-118c53aaa8d7',
      startedAt: new Date('2026-10-09T16:18:05.591Z'),
      expiresAt: new Date('2026-10-09T16:23:05.591Z'),
      billingOrigin: 'dev',
      createdAt: new Date('2026-10-09T16:18:05.591Z'),
      updatedAt: new Date('2026-10-09T16:23:05.591Z'),
    });

    const result = await processSubscriptionProviderPaymentForRow(
      {
        id: '325b2836-000f-5000-b000-18c20154bf9d',
        status: 'succeeded',
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          userId: USER_ID,
          plan: 'archivist',
          kind: 'rebind',
        },
        paymentMethod: { id: 'pm-test', saved: true },
      },
      USER_ID,
      'rebind',
      { observabilitySource: 'poll', subscriptionPaymentId: 'b06b2047-19e9-4c04-bfb2-44e4e5e772b0' }
    );

    expect(result).toEqual({
      paymentMethodUpdated: true,
      alreadyApplied: false,
      staleAfterUnlink: false,
    });
    expect(mockedRebind).toHaveBeenCalledTimes(1);
  });
});
