/**
 * UI tests for compact pricing-modal autopayment disclosure.
 */

import React from 'react';
import { describe, expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { PLAN_CATALOG } from '@shared/lib/payment/subscriptionPlans';

import { SubscriptionPricingAutopaymentDisclosure } from '../SubscriptionPricingAutopaymentDisclosure';

describe('SubscriptionPricingAutopaymentDisclosure', () => {
  test('shows updated disclosure copy with catalog billing period', () => {
    render(<SubscriptionPricingAutopaymentDisclosure lang="ru" ui={null} />);

    expect(screen.getByRole('note')).toBeTruthy();
    expect(
      screen.getByText(/Автопродление: при оплате выбранного тарифа способ оплаты будет сохранён/)
    ).toBeTruthy();
    expect(
      screen.getByText(
        new RegExp(
          `Следующее списание — по цене выбранного тарифа каждые ${PLAN_CATALOG.explorer.durationDays} дней`
        )
      )
    ).toBeTruthy();
    expect(
      screen.getByText(/Автопродление можно отключить или изменить в Кабинет → Подписка/)
    ).toBeTruthy();
    expect(
      screen.getByText(/На странице YooKassa вы отдельно подтвердите сохранение способа оплаты/)
    ).toBeTruthy();
  });
});
