import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { applyAlbumCheckoutCreatePaymentResult } from '../applyAlbumCheckoutCreatePaymentResult';

const genericError = 'Payment failed';

describe('applyAlbumCheckoutCreatePaymentResult', () => {
  let navigateMock: jest.Mock;

  beforeEach(() => {
    navigateMock = jest.fn();
  });

  test('redirects to HTTPS confirmation URL', () => {
    const outcome = applyAlbumCheckoutCreatePaymentResult(
      {
        success: true,
        confirmationUrl: 'https://yoomoney.ru/checkout/payments/v2/contract',
        orderId: 'order-1',
      },
      { returnTo: '/ru/albums/rubber-soul', genericError, navigate: navigateMock }
    );

    expect(outcome).toEqual({ kind: 'redirect' });
    expect(navigateMock).toHaveBeenCalledWith('https://yoomoney.ru/checkout/payments/v2/contract');
  });

  test('returns error when YooKassa checkout URL is missing', () => {
    const outcome = applyAlbumCheckoutCreatePaymentResult(
      {
        success: true,
        confirmationUrl: '',
        orderId: 'order-1',
      },
      { returnTo: '/ru/albums/rubber-soul', genericError, navigate: navigateMock }
    );

    expect(outcome).toEqual({ kind: 'error', message: genericError });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('returns error when YooKassa URL is missing and orderId is absent', () => {
    const outcome = applyAlbumCheckoutCreatePaymentResult(
      {
        success: true,
        confirmationUrl: 'http://insecure.example/pay',
      },
      { returnTo: '/', genericError, navigate: navigateMock }
    );

    expect(outcome).toEqual({ kind: 'error', message: genericError });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('redirects dev payment flow to status URL', () => {
    const outcome = applyAlbumCheckoutCreatePaymentResult(
      {
        success: true,
        devPaymentCompleted: true,
        orderId: 'order-dev',
        paymentId: 'pay-dev',
      },
      { returnTo: '/ru/albums/rubber-soul', genericError, navigate: navigateMock }
    );

    expect(outcome).toEqual({ kind: 'redirect' });
    expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining('/pay/status'));
    expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining('orderId=order-dev'));
  });

  test('redirects fulfillment recovery to success URL', () => {
    const outcome = applyAlbumCheckoutCreatePaymentResult(
      {
        success: true,
        fulfillmentRecovered: true,
        orderId: 'order-recovered',
      },
      { returnTo: '/ru/albums/rubber-soul', genericError, navigate: navigateMock }
    );

    expect(outcome).toEqual({ kind: 'redirect' });
    expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining('/pay/success'));
    expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining('orderId=order-recovered'));
  });
});
