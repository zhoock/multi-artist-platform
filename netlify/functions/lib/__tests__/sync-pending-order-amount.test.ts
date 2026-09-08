import { describe, expect, test } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import {
  albumCheckoutIdempotenceKey,
  orderAmountsEqual,
  formatOrderAmountForIdempotence,
} from '../sync-pending-order-amount';

describe('orderAmountsEqual', () => {
  test('treats minor float drift as equal', () => {
    expect(orderAmountsEqual(100, 100.0004)).toBe(true);
    expect(orderAmountsEqual(100, 100.01)).toBe(false);
  });
});

describe('albumCheckoutIdempotenceKey', () => {
  test('includes order id and formatted amount', () => {
    expect(albumCheckoutIdempotenceKey('order-1', 200)).toBe('order-order-1-200-00');
    expect(formatOrderAmountForIdempotence(4.99)).toBe('4-99');
  });
});
