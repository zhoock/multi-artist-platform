/**
 * UI tests for subscription plan badge.
 */

import React from 'react';
import { describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { SubscriptionPlanBadge } from '@shared/ui/subscriptionPlan';

describe('SubscriptionPlanBadge', () => {
  test('renders plan name with badge class', () => {
    renderWithProviders(<SubscriptionPlanBadge planSlug="archivist" />);
    const badge = screen.getByText('Archivist');
    expect(badge.className).toContain('subscription-plan-badge');
  });
});
