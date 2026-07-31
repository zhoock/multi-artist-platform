import { describe, test, expect } from '@jest/globals';

import { isServiceScreenBodyClassActive } from '../serviceScreenBodyClass';

describe('isServiceScreenBodyClassActive', () => {
  test('applies for 404 and minimal layout routes', () => {
    expect(
      isServiceScreenBodyClassActive({
        isPaymentRoute: false,
        shouldHideChrome: true,
        isMinimalLayoutRoute: false,
      })
    ).toBe(true);

    expect(
      isServiceScreenBodyClassActive({
        isPaymentRoute: false,
        shouldHideChrome: false,
        isMinimalLayoutRoute: true,
      })
    ).toBe(true);
  });

  test('does not apply for payment or standard routes', () => {
    expect(
      isServiceScreenBodyClassActive({
        isPaymentRoute: true,
        shouldHideChrome: true,
        isMinimalLayoutRoute: true,
      })
    ).toBe(false);

    expect(
      isServiceScreenBodyClassActive({
        isPaymentRoute: false,
        shouldHideChrome: false,
        isMinimalLayoutRoute: false,
      })
    ).toBe(false);
  });
});
