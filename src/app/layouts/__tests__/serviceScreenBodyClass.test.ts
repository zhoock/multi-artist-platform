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

  test('applies for payment return routes and not for standard routes', () => {
    expect(
      isServiceScreenBodyClassActive({
        isPaymentRoute: true,
        shouldHideChrome: false,
        isMinimalLayoutRoute: false,
      })
    ).toBe(true);

    expect(
      isServiceScreenBodyClassActive({
        isPaymentRoute: false,
        shouldHideChrome: false,
        isMinimalLayoutRoute: false,
      })
    ).toBe(false);
  });
});
