import {
  AUTH_EXPIRED_BANNER_SESSION_KEY,
  abandonSessionExpiredReauth,
  isSessionExpiredHandlingPending,
  mapApiCodeToBannerReason,
  normalizeSessionExpiredBannerReason,
  resetSessionExpiredHandlingState,
  setSessionExpiredBannerReason,
  tryScheduleSessionExpiredHandling,
} from '../sessionExpired';

describe('sessionExpired helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetSessionExpiredHandlingState();
  });

  test('mapApiCodeToBannerReason maps SESSION_EXPIRED', () => {
    expect(mapApiCodeToBannerReason('SESSION_EXPIRED')).toBe('SESSION_EXPIRED');
    expect(mapApiCodeToBannerReason('INVALID_SESSION')).toBe('INVALID_SESSION');
    expect(mapApiCodeToBannerReason(undefined)).toBe('INVALID_SESSION');
  });

  test('normalizeSessionExpiredBannerReason accepts codes and legacy English', () => {
    expect(normalizeSessionExpiredBannerReason('SESSION_EXPIRED')).toBe('SESSION_EXPIRED');
    expect(normalizeSessionExpiredBannerReason('Session expired. Please sign in again.')).toBe(
      'SESSION_EXPIRED'
    );
    expect(normalizeSessionExpiredBannerReason('Your session is no longer valid.')).toBe(
      'INVALID_SESSION'
    );
  });

  test('tryScheduleSessionExpiredHandling dedupes parallel expiry handling', () => {
    expect(tryScheduleSessionExpiredHandling()).toBe(true);
    expect(tryScheduleSessionExpiredHandling()).toBe(false);
    resetSessionExpiredHandlingState();
    expect(tryScheduleSessionExpiredHandling()).toBe(true);
  });

  test('banner reason is stored under AUTH_EXPIRED_BANNER_SESSION_KEY', () => {
    sessionStorage.setItem(AUTH_EXPIRED_BANNER_SESSION_KEY, 'SESSION_EXPIRED');
    expect(
      normalizeSessionExpiredBannerReason(sessionStorage.getItem(AUTH_EXPIRED_BANNER_SESSION_KEY))
    ).toBe('SESSION_EXPIRED');
  });

  test('isSessionExpiredHandlingPending is true while banner or schedule is active', () => {
    expect(isSessionExpiredHandlingPending()).toBe(false);
    setSessionExpiredBannerReason('SESSION_EXPIRED');
    expect(isSessionExpiredHandlingPending()).toBe(true);
    resetSessionExpiredHandlingState();
    expect(tryScheduleSessionExpiredHandling()).toBe(true);
    expect(isSessionExpiredHandlingPending()).toBe(true);
  });

  test('abandonSessionExpiredReauth clears scheduled flag and banner storage', () => {
    tryScheduleSessionExpiredHandling();
    setSessionExpiredBannerReason('SESSION_EXPIRED');
    expect(isSessionExpiredHandlingPending()).toBe(true);

    abandonSessionExpiredReauth();

    expect(isSessionExpiredHandlingPending()).toBe(false);
    expect(sessionStorage.getItem(AUTH_EXPIRED_BANNER_SESSION_KEY)).toBeNull();
    expect(tryScheduleSessionExpiredHandling()).toBe(true);
  });
});
