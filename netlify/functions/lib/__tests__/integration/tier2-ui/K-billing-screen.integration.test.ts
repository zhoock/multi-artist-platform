/**
 * Group K — BillingScreen + BillingSnapshot (tier2-ui)
 *
 * Spec: docs/adr/pr-10-e2e-specification.md §2 Group K
 * Tier: tier2-ui (mocked getMyArchive — no database)
 */

import React from 'react';
import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { resolveCollectionBillingScreen } from '@features/premiumSubscription/lib/resolveCollectionBillingScreen';

import {
  buildSnapshotFromSubscription,
  expectBillingSnapshot,
  expectInvariantSet,
} from '../../helpers/subscription-e2e-assertions';
import { registerScenarioTodos } from '../../helpers/subscription-e2e-scaffold';
import {
  defaultSeedSubscriptionParams,
  TEST_USER_SUBSCRIBER,
  type SeedSubscriptionParams,
} from '../../helpers/subscription-e2e-fixtures';
import { registerTier2UiHooks } from '../../helpers/subscription-e2e-ui-setup';
import { buildTaggedTestName, type E2eScenarioMeta } from '../../helpers/subscription-e2e-tags';
import { E2E_TIME_ANCHOR, withFrozenTime } from '../../helpers/subscription-e2e-time';
import type { Subscription } from '../../../subscriptions';

import {
  CollectionBillingSummary,
  type CollectionBillingCopy,
} from '../../../../../../src/pages/UserDashboard/components/archive/CollectionBillingSummary';

registerTier2UiHooks();

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({
    open: jest.fn(),
    close: jest.fn(),
    openFromIntentResume: jest.fn(),
    requestAccess: jest.fn(),
    startCheckout: jest.fn(),
  }),
}));

const COPY: CollectionBillingCopy = {
  billingCurrentPlanSection: 'CURRENT PLAN',
  billingLastPlanSection: 'LAST PLAN',
  billingSupportSection: 'SUPPORT',
  billingSupportActiveUntil: 'Active until {date}',
  billingNextChargeOn: 'Next charge — {date}',
  billingSupportExpiredOn: 'Expired {date}',
  billingChangePlanButton: 'Change plan',
  billingRecommendedPlanSection: 'RECOMMENDED',
  billingUpgradePlanButton: 'Upgrade',
  billingCollectionUsageSection: 'Usage',
  billingCollectionUsageCount: '{used} of {limit}',
  billingCancelledBannerTitle: 'Cancelled',
  billingCancelledBannerBody: 'Cancelled body',
  billingCancelledBannerCta: 'Resume',
  billingExpiredBannerTitle: 'Expired',
  billingExpiredBannerBody: 'Expired body',
  billingExpiredBannerCta: 'Choose plan',
  billingPaymentFailedBannerTitle: 'Payment failed',
  billingPaymentFailedBannerBody: 'Payment failed body',
  billingPaymentFailedBannerCta: 'Update payment',
  billingPaymentFailedNextRetry: 'Next retry: {date}',
  billingPaymentFailedGraceEnds: 'Access until: {date}',
  billingDowngradeSlotsBannerTitle: 'Downgrade title',
  billingDowngradeSlotsBannerBody: 'Downgrade body {date} {plan} {used} {limit}',
  billingDowngradeSlotsBannerCta: 'Cancel downgrade',
  priceCurrency: '₽',
  activeSlotsLabel: 'artists',
  billingDisableAutoRenewLink: 'Disable auto-renew',
};

const SCENARIOS: E2eScenarioMeta[] = [
  { id: 'K-NONE-001', title: 'NONE screen empty snapshot', priority: 'P0', tier: 'tier2-ui' },
  { id: 'K-ACTIVE-001', title: 'ACTIVE screen', priority: 'P0', tier: 'tier2-ui' },
  { id: 'K-CANCELLED-001', title: 'CANCELLED screen', priority: 'P0', tier: 'tier2-ui' },
  { id: 'K-PAYMENT_FAILED-001', title: 'PAYMENT_FAILED screen', priority: 'P0', tier: 'tier2-ui' },
  { id: 'K-EXPIRED-001', title: 'EXPIRED screen', priority: 'P0', tier: 'tier2-ui' },
  {
    id: 'K-ACTIVE-002',
    title: 'ACTIVE next charge in plan card',
    priority: 'P1',
    tier: 'tier2-ui',
  },
  {
    id: 'K-ACTIVE-003',
    title: 'ACTIVE without next charge date',
    priority: 'P1',
    tier: 'tier2-ui',
  },
  {
    id: 'K-PAST-004',
    title: 'past grace maps to EXPIRED screen',
    priority: 'P1',
    tier: 'tier2-ui',
  },
  {
    id: 'K-NONE-005',
    title: 'EMPTY_BILLING_SNAPSHOT loading fallback',
    priority: 'P2',
    tier: 'tier2-ui',
  },
];

const P0_IDS = new Set([
  'K-NONE-001',
  'K-ACTIVE-001',
  'K-CANCELLED-001',
  'K-PAYMENT_FAILED-001',
  'K-EXPIRED-001',
]);

function subscriptionFromSeed(id: string, overrides: SeedSubscriptionParams = {}): Subscription {
  const p = defaultSeedSubscriptionParams(overrides);
  const anchor = p.startedAt ?? E2E_TIME_ANCHOR;
  return {
    id,
    userId: p.userId ?? TEST_USER_SUBSCRIBER,
    status: p.status ?? 'active',
    plan: p.plan ?? 'explorer',
    slotsLimit: p.slotsLimit ?? 20,
    provider: 'yookassa',
    providerSubscriptionId: p.providerSubscriptionId ?? 'pay-k-p0',
    startedAt: anchor,
    expiresAt: p.expiresAt ?? new Date('2026-09-03T00:00:00.000Z'),
    paymentMethodId: p.paymentMethodId ?? null,
    paymentMethodTitle: p.paymentMethodTitle ?? null,
    nextChargeAt: p.nextChargeAt ?? null,
    renewalAttemptCount: p.renewalAttemptCount ?? 0,
    scheduledPlan: p.scheduledPlan ?? null,
    firstFailedAt: p.firstFailedAt ?? null,
    createdAt: anchor,
    updatedAt: anchor,
  };
}

function renderBillingScreen(
  screenName: ReturnType<typeof resolveCollectionBillingScreen>,
  billing: ReturnType<typeof buildSnapshotFromSubscription>
) {
  return render(
    React.createElement(CollectionBillingSummary, {
      screen: screenName,
      billing,
      overlays: [],
      slotsUsed: 1,
      lang: 'en',
      copy: COPY,
      onChangePlan: () => undefined,
      onBannerAction: () => undefined,
      onUpgradePlan: () => undefined,
    })
  );
}

describe('Group K — BillingScreen + BillingSnapshot @tier2', () => {
  test(buildTaggedTestName(SCENARIOS[0]!), async () => {
    await withFrozenTime(async () => {
      const snapshot = buildSnapshotFromSubscription(null, E2E_TIME_ANCHOR);
      await expectBillingSnapshot(snapshot, {
        status: null,
        hasPremiumAccess: false,
        plan: null,
      });

      const screenName = resolveCollectionBillingScreen(snapshot);
      expect(screenName).toBe('NONE');

      const { container } = renderBillingScreen(screenName, snapshot);
      expect(container.firstChild).toBeNull();
    }, E2E_TIME_ANCHOR);
  });

  test(buildTaggedTestName(SCENARIOS[1]!), async () => {
    await withFrozenTime(async () => {
      process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
      const subscription = subscriptionFromSeed('sub-k-active', {
        status: 'active',
        plan: 'collector',
        slotsLimit: 60,
        paymentMethodId: 'pm-k-active',
        nextChargeAt: new Date('2026-09-03T00:00:00.000Z'),
      });
      const snapshot = buildSnapshotFromSubscription(subscription, E2E_TIME_ANCHOR);

      await expectBillingSnapshot(snapshot, {
        status: 'active',
        hasPremiumAccess: true,
        plan: 'collector',
      });

      const screenName = resolveCollectionBillingScreen(snapshot);
      expect(screenName).toBe('ACTIVE');

      renderBillingScreen(screenName, snapshot);
      expect(document.querySelector('.collection-billing--active')).toBeTruthy();
      expect(screen.getByText('CURRENT PLAN')).toBeTruthy();
      await expectInvariantSet(subscription, { violations: [] }, { now: E2E_TIME_ANCHOR });
    }, E2E_TIME_ANCHOR);
  });

  test(buildTaggedTestName(SCENARIOS[2]!), async () => {
    await withFrozenTime(async () => {
      process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
      const subscription = subscriptionFromSeed('sub-k-cancelled', {
        status: 'cancel_at_period_end',
        plan: 'explorer',
        paymentMethodId: 'pm-k-cancelled',
      });
      const snapshot = buildSnapshotFromSubscription(subscription, E2E_TIME_ANCHOR);

      await expectBillingSnapshot(snapshot, {
        status: 'cancel_at_period_end',
        hasPremiumAccess: true,
        autoRenewEnabled: false,
      });

      const screenName = resolveCollectionBillingScreen(snapshot);
      expect(screenName).toBe('CANCELLED');

      renderBillingScreen(screenName, snapshot);
      expect(document.querySelector('.collection-billing--cancelled')).toBeTruthy();
      expect(screen.getByText('Cancelled')).toBeTruthy();
      await expectInvariantSet(subscription, { violations: [] }, { now: E2E_TIME_ANCHOR });
    }, E2E_TIME_ANCHOR);
  });

  test(buildTaggedTestName(SCENARIOS[3]!), async () => {
    await withFrozenTime(async () => {
      process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
      const subscription = subscriptionFromSeed('sub-k-past-due', {
        status: 'past_due',
        plan: 'explorer',
        paymentMethodId: 'pm-k-past-due',
        renewalAttemptCount: 1,
        firstFailedAt: new Date('2026-08-04T00:00:00.000Z'),
        nextChargeAt: new Date('2026-08-06T00:00:00.000Z'),
      });
      const snapshot = buildSnapshotFromSubscription(subscription, E2E_TIME_ANCHOR);

      await expectBillingSnapshot(snapshot, {
        status: 'past_due',
        hasPremiumAccess: true,
        renewalAttemptCount: 1,
      });

      const screenName = resolveCollectionBillingScreen(snapshot);
      expect(screenName).toBe('PAYMENT_FAILED');

      renderBillingScreen(screenName, snapshot);
      expect(document.querySelector('.collection-billing--payment_failed')).toBeTruthy();
      expect(screen.getByText('Payment failed')).toBeTruthy();
      await expectInvariantSet(subscription, { violations: [] }, { now: E2E_TIME_ANCHOR });
    }, E2E_TIME_ANCHOR);
  });

  test(buildTaggedTestName(SCENARIOS[4]!), async () => {
    await withFrozenTime(async () => {
      process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
      const subscription = subscriptionFromSeed('sub-k-expired', {
        status: 'expired',
        plan: 'explorer',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      const snapshot = buildSnapshotFromSubscription(subscription, E2E_TIME_ANCHOR);

      await expectBillingSnapshot(snapshot, {
        status: 'expired',
        hasPremiumAccess: false,
      });

      const screenName = resolveCollectionBillingScreen(snapshot);
      expect(screenName).toBe('EXPIRED');

      renderBillingScreen(screenName, snapshot);
      expect(document.querySelector('.collection-billing--expired')).toBeTruthy();
      expect(screen.getByText('Expired')).toBeTruthy();
      await expectInvariantSet(subscription, { violations: [] }, { now: E2E_TIME_ANCHOR });
    }, E2E_TIME_ANCHOR);
  });

  registerScenarioTodos(SCENARIOS.filter((s) => !P0_IDS.has(s.id)));
});
