/**
 * Unit tests for subscription-provider-payment (PR-3.1).
 */

import { describe, expect, test } from '@jest/globals';
import {
  mapDevSubscriptionPaymentToProviderPayment,
  mapYooKassaPaymentToProviderPayment,
} from '../subscription-provider-payment';

describe('mapYooKassaPaymentToProviderPayment', () => {
  test('maps payment_method and metadata', () => {
    const dto = mapYooKassaPaymentToProviderPayment({
      id: 'pay-1',
      status: 'succeeded',
      amount: { value: '149.00', currency: 'RUB' },
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
      amount: { value: '149.00', currency: 'RUB' },
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
        amount: { value: '1.00', currency: 'RUB' },
      })
    ).toBeNull();
  });
});

describe('mapDevSubscriptionPaymentToProviderPayment', () => {
  test('maps dev checkout row', () => {
    const dto = mapDevSubscriptionPaymentToProviderPayment(
      {
        id: 'internal-1',
        user_id: 'user-1',
        provider: 'yookassa',
        provider_payment_id: 'pay-dev',
        status: 'succeeded',
        amount: '1.00',
        currency: 'RUB',
        plan: 'explorer',
      },
      'pay-dev'
    );

    expect(dto?.id).toBe('pay-dev');
    expect(dto?.status).toBe('succeeded');
    expect(dto?.metadata.kind).toBe('initial');
    expect(dto?.paymentMethod).toBeNull();
  });

  test('maps dev rebind row with mock payment method in devMode', () => {
    const dto = mapDevSubscriptionPaymentToProviderPayment(
      {
        id: 'internal-1',
        user_id: 'user-1',
        provider: 'yookassa',
        provider_payment_id: 'pay-dev',
        status: 'succeeded',
        amount: '1.00',
        currency: 'RUB',
        plan: 'explorer',
        kind: 'rebind',
      },
      'pay-dev',
      { devMode: true }
    );

    expect(dto?.metadata.kind).toBe('rebind');
    expect(dto?.paymentMethod?.id).toMatch(/^dev-pm-/);
    expect(dto?.paymentMethod?.title).toMatch(/^Visa •••• \d{4}$/);
  });
});
