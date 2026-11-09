/**
 * UI tests for subscription plan cards in ArchiveAccessModal.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { PLAN_CATALOG } from '@shared/lib/payment/subscriptionPlans';
import { SubscriptionPlanCard } from '../SubscriptionPlanCard';

const createSubscriptionPaymentMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@shared/api/subscription', () => ({
  createSubscriptionPayment: (...args: unknown[]) => createSubscriptionPaymentMock(...args),
}));

describe('SubscriptionPlanCard', () => {
  beforeEach(() => {
    createSubscriptionPaymentMock.mockReset();
  });

  test('renders reference-style plan details from catalog', () => {
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="collector"
        currentPlanSlug={null}
        isPremium={false}
        lang="en"
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('Collector')).toBeTruthy();
    expect(screen.getByText('Up to')).toBeTruthy();
    expect(screen.getByText(String(PLAN_CATALOG.collector.slotsLimit))).toBeTruthy();
    expect(screen.getByText('artists')).toBeTruthy();
    expect(screen.getByText('/ month')).toBeTruthy();
    expect(screen.queryByText('Unlocked tracks')).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose Collector' })).toBeTruthy();
  });

  test('marks current plan with outline action', () => {
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="explorer"
        currentPlanSlug="explorer"
        isPremium
        lang="en"
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Current Plan' })).toBeDisabled();
    expect(document.querySelector('.dashboard-card--selected')).toBeTruthy();
    expect(
      screen.getByText('Current Plan', { selector: '.subscription-plan-modal__plan-badge' })
    ).toBeTruthy();
  });

  test('shows expired badge and renew action for inactive current plan', () => {
    const onSelect = jest.fn();
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="explorer"
        currentPlanSlug="explorer"
        isPremium={false}
        lang="en"
        loadingPlan={null}
        onSelect={onSelect}
      />
    );

    expect(screen.getByText('Expired')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Renew Explorer' }));
    expect(onSelect).toHaveBeenCalledWith('explorer');
  });

  test('does not highlight cards for new users', () => {
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="explorer"
        currentPlanSlug={null}
        isPremium={false}
        lang="en"
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(document.querySelector('.dashboard-card--selected')).toBeNull();
    expect(document.querySelector('.subscription-plan-modal__plan-badge')).toBeNull();
  });

  test('does not render subscription benefits inside plan cards', () => {
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="explorer"
        currentPlanSlug={null}
        isPremium={false}
        lang="en"
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(document.querySelector('.subscription-plan-modal__plan-features')).toBeNull();
    expect(screen.queryByText('Unlocked tracks')).toBeNull();
  });

  test('shows switch action for upgrade path', () => {
    const onSelect = jest.fn();
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="archivist"
        currentPlanSlug="explorer"
        isPremium
        lang="en"
        loadingPlan={null}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Archivist' }));
    expect(onSelect).toHaveBeenCalledWith('archivist');
  });

  test('shows cancel change action for scheduled target plan', () => {
    const onSelect = jest.fn();
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="explorer"
        currentPlanSlug="collector"
        scheduledTargetPlanSlug="explorer"
        isPremium
        lang="ru"
        loadingPlan={null}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Отменить смену' }));
    expect(onSelect).toHaveBeenCalledWith('explorer');
  });

  test('does not render checkout autopayment disclosure inside the plan card', () => {
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="collector"
        currentPlanSlug={null}
        isPremium={false}
        lang="ru"
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.queryByText('Автопродление и сохранение способа оплаты')).toBeNull();
    expect(screen.queryByText(/При оплате тарифа Collector/)).toBeNull();
  });
});
