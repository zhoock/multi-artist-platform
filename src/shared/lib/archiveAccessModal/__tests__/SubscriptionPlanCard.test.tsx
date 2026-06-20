/**
 * UI tests for subscription plan cards in ArchiveAccessModal.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
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
        ui={null}
        priceCurrency="₽"
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText('Collector')).toBeTruthy();
    expect(screen.getByText('Up to')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('artists')).toBeTruthy();
    expect(screen.getByText('/ hour')).toBeTruthy();
    expect(screen.getByText('Exclusive tracks and articles')).toBeTruthy();
    expect(screen.getByText('Larger collection')).toBeTruthy();
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
        priceCurrency="₽"
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Current Plan' })).toBeDisabled();
    expect(document.querySelector('.archive-access-modal__plan-card--current')).toBeTruthy();
    expect(document.querySelector('.archive-access-modal__plan-status-badge')).toBeNull();
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
        priceCurrency="₽"
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
        priceCurrency="₽"
        loadingPlan={null}
        onSelect={jest.fn()}
      />
    );

    expect(document.querySelector('.archive-access-modal__plan-card--current')).toBeNull();
    expect(document.querySelector('.archive-access-modal__plan-status-badge')).toBeNull();
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
        priceCurrency="₽"
        loadingPlan={null}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Archivist' }));
    expect(onSelect).toHaveBeenCalledWith('archivist');
  });
});
