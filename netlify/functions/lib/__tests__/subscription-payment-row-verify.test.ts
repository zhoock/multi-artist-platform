/**
 * PR-10.2 — subscription_payments row verification for webhooks.
 */

import { describe, expect, test } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

import type { SubscriptionPaymentRow } from '../subscription-billing';
import { verifySubscriptionPaymentRowForWebhook } from '../subscription-payment-row-verify';

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function paymentRow(overrides: Partial<SubscriptionPaymentRow> = {}): SubscriptionPaymentRow {
  return {
    id: 'sp-1',
    user_id: USER_ID,
    provider: 'yookassa',
    provider_payment_id: 'pay-1',
    status: 'pending',
    amount: '1.00',
    currency: 'RUB',
    plan: 'explorer',
    kind: 'initial',
    ...overrides,
  };
}

const amountsEqual = (a: string, b: string) => a === b;

describe('verifySubscriptionPaymentRowForWebhook (PR-10.2)', () => {
  test('accepts consistent initial payment row', () => {
    const result = verifySubscriptionPaymentRowForWebhook({
      row: paymentRow(),
      metadataUserId: USER_ID,
      metadataProductType: 'premium_subscription',
      metadataKind: 'initial',
      metadataPlan: 'explorer',
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });

    expect(result.ok).toBe(true);
  });

  test('rejects userId mismatch', () => {
    const result = verifySubscriptionPaymentRowForWebhook({
      row: paymentRow(),
      metadataUserId: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      metadataProductType: 'premium_subscription',
      metadataKind: 'initial',
      metadataPlan: 'explorer',
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'userId mismatch between metadata and payment row',
    });
  });

  test('rejects kind mismatch between metadata and row', () => {
    const result = verifySubscriptionPaymentRowForWebhook({
      row: paymentRow({ kind: 'upgrade' }),
      metadataUserId: USER_ID,
      metadataProductType: 'premium_subscription',
      metadataKind: 'initial',
      metadataPlan: 'explorer',
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'kind mismatch between metadata and payment row',
    });
  });

  test('rejects plan mismatch', () => {
    const result = verifySubscriptionPaymentRowForWebhook({
      row: paymentRow({ plan: 'collector' }),
      metadataUserId: USER_ID,
      metadataProductType: 'premium_subscription',
      metadataKind: 'initial',
      metadataPlan: 'explorer',
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'plan mismatch between metadata and payment row',
    });
  });

  test('rejects amount mismatch', () => {
    const result = verifySubscriptionPaymentRowForWebhook({
      row: paymentRow({ amount: '149.00' }),
      metadataUserId: USER_ID,
      metadataProductType: 'premium_subscription',
      metadataKind: 'initial',
      metadataPlan: 'explorer',
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'amount or currency mismatch between row and provider payment',
    });
  });

  test('allows rebind without plan cross-check', () => {
    const result = verifySubscriptionPaymentRowForWebhook({
      row: paymentRow({ kind: 'rebind', plan: 'explorer', amount: '1.00' }),
      metadataUserId: USER_ID,
      metadataProductType: 'premium_subscription',
      metadataKind: 'rebind',
      metadataPlan: 'explorer',
      amountValue: '1.00',
      currency: 'RUB',
      amountsEqual,
    });

    expect(result.ok).toBe(true);
  });
});
