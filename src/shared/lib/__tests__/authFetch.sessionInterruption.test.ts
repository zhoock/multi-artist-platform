/**
 * @jest-environment jsdom
 */
import {
  isSessionInvalidationErrorCode,
  isSessionInvalidationResponse,
  shouldSuppressApiErrorUi,
} from '../authFetch';
import { resetSessionExpiredHandlingState, setSessionExpiredBannerReason } from '../sessionExpired';

describe('authFetch session interruption helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetSessionExpiredHandlingState();
  });

  test('isSessionInvalidationErrorCode matches session-expiry API codes with bearer', () => {
    expect(isSessionInvalidationErrorCode('SESSION_EXPIRED', true)).toBe(true);
    expect(isSessionInvalidationErrorCode('INVALID_SESSION', true)).toBe(true);
    expect(isSessionInvalidationErrorCode('UNAUTHORIZED', true)).toBe(true);
    expect(isSessionInvalidationErrorCode(undefined, true)).toBe(true);
    expect(isSessionInvalidationErrorCode('INVALID_CREDENTIALS', true)).toBe(false);
    expect(isSessionInvalidationErrorCode('SESSION_EXPIRED', false)).toBe(false);
  });

  test('isSessionInvalidationResponse detects 401 session invalidation', async () => {
    const response = {
      status: 401,
      clone: () => ({
        json: async () => ({ code: 'SESSION_EXPIRED' }),
      }),
    } as Response;

    await expect(
      isSessionInvalidationResponse(response, {
        headers: { Authorization: 'Bearer token' },
      })
    ).resolves.toBe(true);
  });

  test('shouldSuppressApiErrorUi is true while session-expired handling is pending', async () => {
    setSessionExpiredBannerReason('SESSION_EXPIRED');

    const response = {
      status: 500,
      clone: () => ({
        json: async () => ({}),
      }),
    } as Response;

    await expect(shouldSuppressApiErrorUi(response)).resolves.toBe(true);
  });

  test('shouldSuppressApiErrorUi is false for unrelated 500 errors', async () => {
    const response = {
      status: 500,
      clone: () => ({
        json: async () => ({ code: 'INTERNAL_ERROR' }),
      }),
    } as Response;

    await expect(
      shouldSuppressApiErrorUi(response, {
        headers: { Authorization: 'Bearer token' },
      })
    ).resolves.toBe(false);
  });
});
