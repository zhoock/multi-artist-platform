import { describe, expect, test } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import {
  isAlbumCheckoutPaymentAmountCurrent,
  isReusableAlbumCheckoutPayment,
} from '../album-checkout-payment';

describe('isAlbumCheckoutPaymentAmountCurrent', () => {
  test('matches order amount to two decimal places', () => {
    expect(isAlbumCheckoutPaymentAmountCurrent('200.00', 200)).toBe(true);
    expect(isAlbumCheckoutPaymentAmountCurrent('100.00', 200)).toBe(false);
  });
});

describe('isReusableAlbumCheckoutPayment', () => {
  test('accepts pending payment at current amount', () => {
    expect(
      isReusableAlbumCheckoutPayment(
        { id: 'p1', status: 'pending', amount: { value: '100.00', currency: 'RUB' } },
        100
      )
    ).toBe(true);
  });

  test('rejects pending payment at stale amount', () => {
    expect(
      isReusableAlbumCheckoutPayment(
        { id: 'p1', status: 'pending', amount: { value: '100.00', currency: 'RUB' } },
        200
      )
    ).toBe(false);
  });

  test('rejects non-open statuses even when amount matches', () => {
    expect(
      isReusableAlbumCheckoutPayment(
        { id: 'p1', status: 'canceled', amount: { value: '100.00', currency: 'RUB' } },
        100
      )
    ).toBe(false);
  });
});
