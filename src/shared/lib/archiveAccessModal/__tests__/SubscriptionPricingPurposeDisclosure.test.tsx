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
      screen.getByText(
        'Подписка открывает доступ к трекам, статьям, стемам и скачиванию альбомов выбранных артистов.'
      )
    ).toBeTruthy();
    expect(document.querySelector('.subscription-plan-modal__pricing-purpose')).toBeTruthy();
    expect(document.querySelector('.subscription-plan-modal__pricing-purpose-lead')).toBeTruthy();
    expect(document.querySelector('.subscription-plan-modal__pricing-purpose-rest')).toBeNull();
  });

  test('ignores legacy subscriptionPricingPurposeLead/Rest copy', () => {
    render(
      <SubscriptionPricingPurposeDisclosure
        lang="ru"
        ui={
          {
            titles: {
              subscriptionPricingPurposeLead: 'Подписка предоставляет доступ к премиум-функциям:',
              subscriptionPricingPurposeRest: 'закрытым трекам, статьям, материалам и скачиванию.',
            },
          } as never
        }
      />
    );

    expect(screen.queryByText(/закрытым трекам/)).toBeNull();
    expect(
      screen.getByText(
        'Подписка открывает доступ к трекам, статьям, стемам и скачиванию альбомов выбранных артистов.'
      )
    ).toBeTruthy();
  });
});
