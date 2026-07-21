import {
  ALBUM_PAY_FAIL_PATH,
  ALBUM_PAY_STATUS_PATH,
  ALBUM_PAY_SUCCESS_PATH,
  albumPaymentModeFromPathname,
  albumPaymentOutcomePath,
} from '../paymentRoutes';

describe('paymentRoutes', () => {
  it('maps pathnames to route modes', () => {
    expect(albumPaymentModeFromPathname(ALBUM_PAY_STATUS_PATH)).toBe('resolve');
    expect(albumPaymentModeFromPathname(ALBUM_PAY_SUCCESS_PATH)).toBe('success');
    expect(albumPaymentModeFromPathname(ALBUM_PAY_FAIL_PATH)).toBe('fail');
  });

  it('maps payment status to outcome path', () => {
    expect(albumPaymentOutcomePath('succeeded')).toBe(ALBUM_PAY_SUCCESS_PATH);
    expect(albumPaymentOutcomePath('canceled')).toBe(ALBUM_PAY_FAIL_PATH);
    expect(albumPaymentOutcomePath('pending')).toBe(ALBUM_PAY_FAIL_PATH);
  });
});
