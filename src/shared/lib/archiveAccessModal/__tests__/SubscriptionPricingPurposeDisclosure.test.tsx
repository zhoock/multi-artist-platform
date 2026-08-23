/**
 * UI tests for pricing-modal payment purpose disclosure (YooKassa requirement).
 */

import React from 'react';
import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { SubscriptionPricingPurposeDisclosure } from '../SubscriptionPricingPurposeDisclosure';

describe('SubscriptionPricingPurposeDisclosure', () => {
  test('shows payment purpose copy with lead and rest segments', () => {
    render(<SubscriptionPricingPurposeDisclosure lang="ru" ui={null} />);

    expect(
      screen.getByText('Подписка предоставляет доступ к премиум-функциям выбранного тарифа:')
    ).toBeTruthy();
    expect(
      screen.getByText('закрытым трекам, статьям, материалам и скачиванию альбомов.')
    ).toBeTruthy();
    expect(document.querySelector('.subscription-plan-modal__pricing-purpose')).toBeTruthy();
    expect(document.querySelector('.subscription-plan-modal__pricing-purpose-lead')).toBeTruthy();
    expect(document.querySelector('.subscription-plan-modal__pricing-purpose-rest')).toBeTruthy();
  });
});
