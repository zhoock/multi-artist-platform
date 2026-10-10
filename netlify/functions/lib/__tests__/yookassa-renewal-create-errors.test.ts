import { describe, expect, test } from '@jest/globals';

import { isYooKassaPaymentMethodNotSavedError } from '../yookassa-renewal-create-errors';

describe('isYooKassaPaymentMethodNotSavedError', () => {
  test('detects production YooKassa 400 not-saved PM response', () => {
    const error = new Error(
      'YooKassa renewal create failed: 400 {\n  "description" : "This payment_method is not saved. Specify it with the saved=true value",\n  "parameter" : "payment_method_id"\n}'
    );
    expect(isYooKassaPaymentMethodNotSavedError(error)).toBe(true);
  });

  test('rejects other provider errors', () => {
    expect(
      isYooKassaPaymentMethodNotSavedError(
        new Error('YooKassa renewal create failed: 402 insufficient funds')
      )
    ).toBe(false);
    expect(isYooKassaPaymentMethodNotSavedError(new Error('network failure'))).toBe(false);
  });

  test('rejects generic HTTP 400 without payment_method not saved', () => {
    expect(
      isYooKassaPaymentMethodNotSavedError(
        new Error('YooKassa renewal create failed: 400 {"description":"invalid_request"}')
      )
    ).toBe(false);
  });
});
