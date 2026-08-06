/**
 * Unit tests for subscription-yookassa (PR-3): checkout payload and PM extraction.
 */

import { describe, expect, test, afterEach } from '@jest/globals';
import {
  buildInitialSubscriptionPaymentPayload,
  buildRebindSubscriptionPaymentPayload,
  buildRenewalSubscriptionPaymentPayload,
  devMockPaymentMethodId,
  extractSavedPaymentMethodId,
  SUBSCRIPTION_PAYMENT_KIND_INITIAL,
  SUBSCRIPTION_PAYMENT_KIND_REBIND,
  SUBSCRIPTION_PAYMENT_KIND_RENEWAL,
} from '../subscription-yookassa';
import {
  formatPlanAmountValue,
  getPlanPriceCurrencyCode,
} from '../../../../src/shared/lib/payment/subscriptionPlanCatalog';

const CURRENCY = getPlanPriceCurrencyCode();
const COLLECTOR_AMOUNT = formatPlanAmountValue('collector');
const EXPLORER_AMOUNT = formatPlanAmountValue('explorer');

const BASE_PARAMS = {
  amountValue: COLLECTOR_AMOUNT,
  description: 'Collector Support',
  returnUrl: 'https://example.com/pay/subscription-success',
  userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  planSlug: 'collector',
  customerEmail: 'user@example.com',
};

describe('buildInitialSubscriptionPaymentPayload', () => {
  const original = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    } else {
      process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = original;
    }
  });

  test('flag off: no save_payment_method (legacy checkout shape)', () => {
    delete process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED;
    const payload = buildInitialSubscriptionPaymentPayload(BASE_PARAMS);
    expect(payload.save_payment_method).toBeUndefined();
    expect(payload.metadata).toEqual({
      productType: 'premium_subscription',
      userId: BASE_PARAMS.userId,
      plan: 'collector',
      kind: SUBSCRIPTION_PAYMENT_KIND_INITIAL,
    });
    expect(payload.amount).toEqual({ value: COLLECTOR_AMOUNT, currency: CURRENCY });
    expect(payload.receipt).toBeDefined();
  });

  test('flag on: includes save_payment_method and kind metadata', () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    const payload = buildInitialSubscriptionPaymentPayload(BASE_PARAMS);
    expect(payload.save_payment_method).toBe(true);
    expect((payload.metadata as Record<string, string>).kind).toBe('initial');
  });
});

describe('buildRebindSubscriptionPaymentPayload', () => {
  test('uses redirect confirmation and rebind kind metadata', () => {
    const payload = buildRebindSubscriptionPaymentPayload({
      amountValue: COLLECTOR_AMOUNT,
      description: 'Payment method verification',
      returnUrl: BASE_PARAMS.returnUrl,
      userId: BASE_PARAMS.userId,
      planSlug: 'collector',
      customerEmail: BASE_PARAMS.customerEmail,
    });

    expect(payload.save_payment_method).toBe(true);
    expect((payload.metadata as Record<string, string>).kind).toBe(
      SUBSCRIPTION_PAYMENT_KIND_REBIND
    );
    expect(payload.amount).toEqual({ value: COLLECTOR_AMOUNT, currency: CURRENCY });
    expect(payload.confirmation).toEqual({
      type: 'redirect',
      return_url: BASE_PARAMS.returnUrl,
    });
  });
});

describe('buildRenewalSubscriptionPaymentPayload', () => {
  test('uses payment_method_id and renewal kind metadata', () => {
    const payload = buildRenewalSubscriptionPaymentPayload({
      amountValue: EXPLORER_AMOUNT,
      description: 'Explorer Support',
      userId: BASE_PARAMS.userId,
      planSlug: 'explorer',
      customerEmail: 'user@example.com',
      paymentMethodId: 'pm-saved-1',
    });

    expect(payload.payment_method_id).toBe('pm-saved-1');
    expect(payload.confirmation).toBeUndefined();
    expect(payload.amount).toEqual({ value: EXPLORER_AMOUNT, currency: CURRENCY });
    expect((payload.metadata as Record<string, string>).kind).toBe(
      SUBSCRIPTION_PAYMENT_KIND_RENEWAL
    );
    expect(payload.receipt).toBeDefined();
  });
});

describe('extractSavedPaymentMethodId', () => {
  test('returns id when payment_method.saved is true', () => {
    expect(
      extractSavedPaymentMethodId({
        id: 'pay-1',
        payment_method: { id: 'pm-abc', saved: true },
      })
    ).toBe('pm-abc');
  });

  test('returns null when not saved or missing id', () => {
    expect(
      extractSavedPaymentMethodId({
        id: 'pay-1',
        payment_method: { id: 'pm-abc', saved: false },
      })
    ).toBeNull();
    expect(extractSavedPaymentMethodId({ id: 'pay-1', payment_method: null })).toBeNull();
    expect(extractSavedPaymentMethodId({ id: 'pay-1' })).toBeNull();
  });
});

describe('devMockPaymentMethodId', () => {
  test('derives stable dev PM prefix from provider payment id', () => {
    expect(devMockPaymentMethodId('pay-uuid')).toBe('dev-pm-pay-uuid');
  });
});
