/**
 * UI tests for subscription plan cards in ArchiveAccessModal.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { PLAN_CATALOG } from '@shared/lib/payment/subscriptionPlans';
import { SubscriptionPlanCard } from '../SubscriptionPlanCard';

const isAutoRenewClientEnabledMock = jest.fn(() => true);

jest.mock('@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled', () => ({
  isSubscriptionAutoRenewClientEnabled: () => isAutoRenewClientEnabledMock(),
}));

const createSubscriptionPaymentMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@shared/api/subscription', () => ({
  createSubscriptionPayment: (...args: unknown[]) => createSubscriptionPaymentMock(...args),
}));

describe('SubscriptionPlanCard', () => {
  beforeEach(() => {
    createSubscriptionPaymentMock.mockReset();
    isAutoRenewClientEnabledMock.mockReturnValue(true);
  });

  test('renders reference-style plan details from catalog', () => {
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="collector"
        currentPlanSlug={null}
        isPremium={false}
        lang="en"
        ui={null}
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('Collector')).toBeTruthy();
    expect(screen.getByText('Up to')).toBeTruthy();
    expect(screen.getByText(String(PLAN_CATALOG.collector.slotsLimit))).toBeTruthy();
    expect(screen.getByText('artists')).toBeTruthy();
    expect(screen.getByText('/ month')).toBeTruthy();
    expect(screen.getByText('Locked tracks')).toBeTruthy();
    expect(screen.getByText('Locked articles')).toBeTruthy();
    expect(screen.getByText('Locked stems')).toBeTruthy();
    expect(screen.getByText('Album downloads')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose Collector' })).toBeTruthy();
  });

  test('marks current plan with outline action', () => {
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="explorer"
        currentPlanSlug="explorer"
        isPremium
        lang="en"
        ui={null}
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
        ui={null}
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
        ui={null}
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(document.querySelector('.dashboard-card--selected')).toBeNull();
    expect(document.querySelector('.subscription-plan-modal__plan-badge')).toBeNull();
  });

  test('shows the same subscription benefits on every plan card', () => {
    const onSelect = jest.fn();
    renderWithProviders(
      <>
        <SubscriptionPlanCard
          planSlug="explorer"
          currentPlanSlug={null}
          isPremium={false}
          lang="en"
          ui={null}
          loadingPlan={null}
          onSelect={onSelect}
        />
        <SubscriptionPlanCard
          planSlug="collector"
          currentPlanSlug={null}
          isPremium={false}
          lang="en"
          ui={null}
          loadingPlan={null}
          onSelect={onSelect}
        />
        <SubscriptionPlanCard
          planSlug="archivist"
          currentPlanSlug={null}
          isPremium={false}
          lang="en"
          ui={null}
          loadingPlan={null}
          onSelect={onSelect}
        />
      </>
    );

    expect(screen.getAllByText('Locked tracks')).toHaveLength(3);
    expect(screen.getAllByText('Locked articles')).toHaveLength(3);
    expect(screen.getAllByText('Locked stems')).toHaveLength(3);
    expect(screen.getAllByText('Album downloads')).toHaveLength(3);
  });

  test('shows switch action for upgrade path', () => {
    const onSelect = jest.fn();
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="archivist"
        currentPlanSlug="explorer"
        isPremium
        lang="en"
        ui={null}
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
        ui={null}
        loadingPlan={null}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Отменить смену' }));
    expect(onSelect).toHaveBeenCalledWith('explorer');
  });

  test('shows checkout autopayment disclosure for direct checkout when flag is on', () => {
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="collector"
        currentPlanSlug={null}
        isPremium={false}
        lang="ru"
        ui={null}
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('Автопродление и сохранение способа оплаты')).toBeTruthy();
    expect(
      screen.getByText(/При оплате тарифа Collector ваш способ оплаты будет сохранён/)
    ).toBeTruthy();
    expect(
      screen.getByText(
        `Следующее списание: ${PLAN_CATALOG.collector.priceRubProduction} ₽ каждые ${PLAN_CATALOG.collector.durationDays} дней.`
      )
    ).toBeTruthy();
    expect(screen.getByText(/На странице YooKassa вы отдельно подтвердите/)).toBeTruthy();
  });

  test('hides checkout autopayment disclosure when auto-renew flag is off', () => {
    isAutoRenewClientEnabledMock.mockReturnValue(false);

    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="collector"
        currentPlanSlug={null}
        isPremium={false}
        lang="en"
        ui={null}
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.queryByText(/Auto-renewal and saved payment method/i)).toBeNull();
  });

  test('hides checkout autopayment disclosure for upgrade switch path', () => {
    renderWithProviders(
      <SubscriptionPlanCard
        planSlug="archivist"
        currentPlanSlug="explorer"
        isPremium
        lang="en"
        ui={null}
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.queryByText(/Auto-renewal and saved payment method/i)).toBeNull();
  });
});
