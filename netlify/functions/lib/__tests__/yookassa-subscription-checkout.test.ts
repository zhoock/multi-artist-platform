import { describe, expect, test } from '@jest/globals';

import {
  mapYooKassaSubscriptionCheckoutFailure,
  parseYooKassaApiErrorBody,
} from '../yookassa-subscription-checkout';

describe('parseYooKassaApiErrorBody', () => {
  test('parses JSON error payload', () => {
    expect(
      parseYooKassaApiErrorBody(
        JSON.stringify({
          type: 'error',
          code: 'invalid_request',
          description: 'Invalid receipt',
        })
      )
    ).toEqual({
      type: 'error',
      code: 'invalid_request',
      description: 'Invalid receipt',
    });
  });

  test('returns null for non-JSON', () => {
    expect(parseYooKassaApiErrorBody('upstream timeout')).toBeNull();
  });
});

describe('mapYooKassaSubscriptionCheckoutFailure', () => {
  test('maps autopayments forbidden errors', () => {
    const result = mapYooKassaSubscriptionCheckoutFailure(403, {
      code: 'forbidden',
      description: 'save_payment_method is not allowed for this shop',
    });
    expect(result.code).toBe('YOOKASSA_AUTOPAYMENTS_NOT_ENABLED');
  });

  test('maps receipt validation errors', () => {
    const result = mapYooKassaSubscriptionCheckoutFailure(400, {
      code: 'invalid_request',
      description: 'Invalid parameter receipt.items[0].payment_mode',
    });
    expect(result.code).toBe('YOOKASSA_RECEIPT_REJECTED');
  });

  test('falls back to generic checkout failure', () => {
    const result = mapYooKassaSubscriptionCheckoutFailure(500, {
      code: 'internal_server_error',
      description: 'Something went wrong',
    });
    expect(result.code).toBe('YOOKASSA_CHECKOUT_FAILED');
    expect(result.providerDescription).toBe('Something went wrong');
  });
});
