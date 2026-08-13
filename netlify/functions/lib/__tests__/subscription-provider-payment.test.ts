/**
 * Unit tests for subscription-provider-payment (PR-3.1).
 */

import { describe, expect, test } from '@jest/globals';
import {
  mapDevSubscriptionPaymentToProviderPayment,
  mapYooKassaPaymentToProviderPayment,
} from '../subscription-provider-payment';
import {
  formatPlanAmountValue,
  getPlanPriceCurrencyCode,
} from '../../../../src/shared/lib/payment/subscriptionPlanCatalog';

const CURRENCY = getPlanPriceCurrencyCode();
const COLLECTOR_AMOUNT = formatPlanAmountValue('collector');
const EXPLORER_AMOUNT = formatPlanAmountValue('explorer');

describe('mapYooKassaPaymentToProviderPayment', () => {
  test('maps payment_method and metadata', () => {
    const dto = mapYooKassaPaymentToProviderPayment({
      id: 'pay-1',
      status: 'succeeded',
      amount: { value: COLLECTOR_AMOUNT, currency: CURRENCY },
      metadata: {
        productType: 'premium_subscription',
        userId: 'user-1',
        plan: 'collector',
        kind: 'initial',
      },
      payment_method: { id: 'pm-1', saved: true },
      confirmation: { confirmation_url: 'https://pay.example/confirm' },
    });

    expect(dto).toEqual({
      id: 'pay-1',
      status: 'succeeded',
      amount: { value: COLLECTOR_AMOUNT, currency: CURRENCY },
      metadata: {
        productType: 'premium_subscription',
        userId: 'user-1',
        plan: 'collector',
        kind: 'initial',
      },
      paymentMethod: { id: 'pm-1', saved: true, title: null },
      confirmationUrl: 'https://pay.example/confirm',
    });
  });

  test('returns null for unsupported status', () => {
    expect(
      mapYooKassaPaymentToProviderPayment({
        id: 'pay-1',
        status: 'refunded',
        amount: { value: EXPLORER_AMOUNT, currency: CURRENCY },
      })
    ).toBeNull();
  });
});

describe('mapDevSubscriptionPaymentToProviderPayment', () => {
  test('maps dev checkout row without payment method when devMode is off', () => {
    const dto = mapDevSubscriptionPaymentToProviderPayment(
      {
        id: 'internal-1',
        user_id: 'user-1',
        provider: 'yookassa',
        provider_payment_id: 'pay-dev',
        status: 'succeeded',
        amount: EXPLORER_AMOUNT,
        currency: CURRENCY,
        plan: 'explorer',
      },
      'pay-dev'
    );

    expect(dto?.id).toBe('pay-dev');
    expect(dto?.status).toBe('succeeded');
    expect(dto?.metadata.kind).toBe('initial');
    expect(dto?.paymentMethod).toBeNull();
  });

  test('maps dev initial and renewal rows with mock payment method in devMode', () => {
    for (const kind of ['initial', 'renewal'] as const) {
      const dto = mapDevSubscriptionPaymentToProviderPayment(
        {
          id: 'internal-1',
          user_id: 'user-1',
          provider: 'yookassa',
          provider_payment_id: 'pay-dev',
          status: 'succeeded',
          amount: EXPLORER_AMOUNT,
          currency: CURRENCY,
          plan: 'explorer',
          kind,
        },
        'pay-dev',
        { devMode: true }
      );

      expect(dto?.metadata.kind).toBe(kind);
      expect(dto?.paymentMethod?.id).toBe('dev-pm-pay-dev');
      expect(dto?.paymentMethod?.saved).toBe(true);
    }
  });

  test('maps dev rebind row with mock payment method in devMode', () => {
    const dto = mapDevSubscriptionPaymentToProviderPayment(
      {
        id: 'internal-1',
        user_id: 'user-1',
        provider: 'yookassa',
        provider_payment_id: 'pay-dev',
        status: 'succeeded',
        amount: EXPLORER_AMOUNT,
        currency: CURRENCY,
        plan: 'explorer',
        kind: 'rebind',
      },
      'pay-dev',
      { devMode: true }
    );

    expect(dto?.metadata.kind).toBe('rebind');
    expect(dto?.paymentMethod?.id).toMatch(/^dev-pm-/);
    expect(dto?.paymentMethod?.title).toMatch(/^Visa •••• \d{4}$/);
    expect(dto?.metadata.resumeAutoRenew).toBeUndefined();
  });

  test('copies resumeAutoRenew intent from raw_last_event', () => {
    const dto = mapDevSubscriptionPaymentToProviderPayment(
      {
        id: 'internal-1',
        user_id: 'user-1',
        provider: 'yookassa',
        provider_payment_id: 'pay-dev',
        status: 'succeeded',
        amount: EXPLORER_AMOUNT,
        currency: CURRENCY,
        plan: 'explorer',
        kind: 'rebind',
        raw_last_event: { resumeAutoRenew: true, devPaymentMode: true },
      },
      'pay-dev',
      { devMode: true }
    );

    expect(dto?.metadata.kind).toBe('rebind');
    expect(dto?.metadata.resumeAutoRenew).toBe('true');
  });
});
