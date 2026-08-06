/** @jest-environment jsdom */

import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { BILLING_OVERLAY } from '@features/premiumSubscription/lib/billingOverlay';
import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';

jest.mock('@shared/lib/archiveAccessModal', () => ({
  useArchiveAccessModal: () => ({
    open: jest.fn(),
    close: jest.fn(),
    openFromIntentResume: jest.fn(),
    requestAccess: jest.fn(),
    startCheckout: jest.fn(),
  }),
}));

import { CollectionBillingSummary, type CollectionBillingCopy } from '../CollectionBillingSummary';

const copy: CollectionBillingCopy = {
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
  activeSlotsLabel: 'artists',
  billingDisableAutoRenewLink: 'Disable auto-renew',
};

describe('CollectionBillingSummary overlays', () => {
  test('renders every overlay from resolver output without filtering', () => {
    render(
      <CollectionBillingSummary
        screen="ACTIVE"
        billing={{
          ...EMPTY_BILLING_SNAPSHOT,
          status: 'active',
          hasPremiumAccess: true,
          plan: 'collector',
          slotsLimit: 2,
          scheduledPlan: 'explorer',
          nextChargeAt: '2026-08-07T12:00:00.000Z',
          expiresAt: '2026-09-03T00:00:00.000Z',
        }}
        overlays={[BILLING_OVERLAY.DOWNGRADE_SLOTS]}
        slotsUsed={2}
        lang="en"
        copy={copy}
        onChangePlan={() => undefined}
        onBannerAction={() => undefined}
        onUpgradePlan={() => undefined}
        onCancelScheduledDowngrade={() => undefined}
      />
    );

    expect(screen.getByText('Downgrade title')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel downgrade' })).toBeTruthy();
  });

  test('shows next charge date in ACTIVE current plan card', () => {
    render(
      <CollectionBillingSummary
        screen="ACTIVE"
        billing={{
          ...EMPTY_BILLING_SNAPSHOT,
          status: 'active',
          hasPremiumAccess: true,
          plan: 'collector',
          slotsLimit: 2,
          nextChargeAt: '2026-08-06T00:00:00.000Z',
          expiresAt: '2026-09-03T00:00:00.000Z',
        }}
        overlays={[]}
        slotsUsed={1}
        lang="en"
        copy={copy}
        onChangePlan={() => undefined}
        onBannerAction={() => undefined}
        onUpgradePlan={() => undefined}
      />
    );

    expect(screen.getByText(/Next charge —/)).toBeTruthy();
    expect(screen.queryByText(/Active until/)).toBeNull();
  });

  test('renders dunning supplemental lines on PAYMENT_FAILED', () => {
    render(
      <CollectionBillingSummary
        screen="PAYMENT_FAILED"
        billing={{
          ...EMPTY_BILLING_SNAPSHOT,
          status: 'past_due',
          hasPremiumAccess: true,
          plan: 'collector',
          slotsLimit: 2,
          expiresAt: '2026-08-01T00:00:00.000Z',
          nextChargeAt: '2026-08-08T12:00:00.000Z',
          firstFailedAt: '2026-08-05T12:00:00.000Z',
        }}
        overlays={[]}
        slotsUsed={1}
        lang="en"
        copy={copy}
        onChangePlan={() => undefined}
        onBannerAction={() => undefined}
        onUpgradePlan={() => undefined}
      />
    );

    expect(screen.getByText(/Next retry:/)).toBeTruthy();
    expect(screen.getByText(/Access until:/)).toBeTruthy();
  });

  test('hides resume and rebind CTAs when auto-renew actions are disabled', () => {
    render(
      <CollectionBillingSummary
        screen="CANCELLED"
        billing={{
          ...EMPTY_BILLING_SNAPSHOT,
          status: 'cancel_at_period_end',
          hasPremiumAccess: true,
          plan: 'collector',
          slotsLimit: 2,
          expiresAt: '2026-09-03T00:00:00.000Z',
        }}
        overlays={[]}
        slotsUsed={1}
        lang="en"
        copy={copy}
        autoRenewActionsEnabled={false}
        onChangePlan={() => undefined}
        onBannerAction={() => undefined}
        onUpgradePlan={() => undefined}
      />
    );

    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();

    render(
      <CollectionBillingSummary
        screen="PAYMENT_FAILED"
        billing={{
          ...EMPTY_BILLING_SNAPSHOT,
          status: 'past_due',
          hasPremiumAccess: true,
          plan: 'collector',
          slotsLimit: 2,
          expiresAt: '2026-08-01T00:00:00.000Z',
          nextChargeAt: '2026-08-08T12:00:00.000Z',
          firstFailedAt: '2026-08-05T12:00:00.000Z',
        }}
        overlays={[]}
        slotsUsed={1}
        lang="en"
        copy={copy}
        autoRenewActionsEnabled={false}
        onChangePlan={() => undefined}
        onBannerAction={() => undefined}
        onUpgradePlan={() => undefined}
      />
    );

    expect(screen.queryByRole('button', { name: 'Update payment' })).toBeNull();
  });
});
