import { describe, expect, test } from '@jest/globals';

import { isFullRefundAmount } from '../yookassa-webhook-verify';

describe('isFullRefundAmount', () => {
  test('returns true when refund equals order amount', () => {
    expect(isFullRefundAmount('499.00', '499')).toBe(true);
    expect(isFullRefundAmount('500.00', '500.00')).toBe(true);
  });

  test('returns false for partial refund', () => {
    expect(isFullRefundAmount('100.00', '499.00')).toBe(false);
  });
});
