/**
 * UI tests for UpgradePlanConfirmModal checkout autopayment disclosure.
 */

import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { PLAN_CATALOG } from '@shared/lib/payment/subscriptionPlans';

import { UpgradePlanConfirmModal } from '../UpgradePlanConfirmModal';

const isAutoRenewClientEnabledMock = jest.fn(() => true);

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: () => null,
}));

jest.mock('@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled', () => ({
  isSubscriptionAutoRenewClientEnabled: () => isAutoRenewClientEnabledMock(),
}));

describe('UpgradePlanConfirmModal checkout autopayment disclosure', () => {
  beforeEach(() => {
    isAutoRenewClientEnabledMock.mockReturnValue(true);
  });

  test('shows disclosure with catalog price and duration when flag is on', () => {
    render(
      <UpgradePlanConfirmModal
        isOpen
        currentPlanSlug="explorer"
        targetPlanSlug="collector"
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />
    );

    expect(screen.getByText('Auto-renewal and saved payment method')).toBeTruthy();
    expect(
      screen.getByText(/When you pay for the Collector plan, your payment method will be saved/)
    ).toBeTruthy();
    expect(
      screen.getByText(
        `Next charge: ${PLAN_CATALOG.collector.priceRubProduction} ₽ every ${PLAN_CATALOG.collector.durationDays} days.`
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        /On the YooKassa page you will separately confirm saving your payment method./
      )
    ).toBeTruthy();
  });

  test('hides disclosure when auto-renew flag is off', () => {
    isAutoRenewClientEnabledMock.mockReturnValue(false);

    render(
      <UpgradePlanConfirmModal
        isOpen
        currentPlanSlug="explorer"
        targetPlanSlug="collector"
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />
    );

    expect(screen.queryByText(/Auto-renewal and saved payment method/i)).toBeNull();
  });
});
