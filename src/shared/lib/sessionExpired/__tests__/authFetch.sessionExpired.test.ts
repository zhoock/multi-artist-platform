/**
 * @jest-environment jsdom
 */
import { fetchWithAuthSession } from '../../authFetch';
import { invalidateAuthSession } from '../../auth';
import {
  AUTH_EXPIRED_BANNER_SESSION_KEY,
  SESSION_EXPIRED_REQUEST_EVENT,
  resetSessionExpiredHandlingState,
} from '../sessionExpired';

jest.mock('../../auth', () => ({
  invalidateAuthSession: jest.fn(),
}));

describe('fetchWithAuthSession session expiry', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetSessionExpiredHandlingState();
    jest.clearAllMocks();
    window.history.pushState({}, '', '/albums/test?artist=band');
  });

  test('emits session-expired signal instead of hard redirect', async () => {
    const listener = jest.fn();
    window.addEventListener(SESSION_EXPIRED_REQUEST_EVENT, listener);

    global.fetch = jest.fn().mockResolvedValue({
      status: 401,
      clone: () => ({
        json: async () => ({ code: 'SESSION_EXPIRED' }),
      }),
    }) as unknown as typeof fetch;

    await fetchWithAuthSession('/api/albums', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(invalidateAuthSession).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(AUTH_EXPIRED_BANNER_SESSION_KEY)).toBe('SESSION_EXPIRED');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({
      reason: 'SESSION_EXPIRED',
      skipNavigation: false,
    });
    expect(window.location.pathname).toBe('/albums/test');

    window.removeEventListener(SESSION_EXPIRED_REQUEST_EVENT, listener);
  });

  test('skips navigation signal when already on /auth', async () => {
    window.history.pushState({}, '', '/auth?mode=login');
    const listener = jest.fn();
    window.addEventListener(SESSION_EXPIRED_REQUEST_EVENT, listener);

    global.fetch = jest.fn().mockResolvedValue({
      status: 401,
      clone: () => ({
        json: async () => ({ code: 'SESSION_EXPIRED' }),
      }),
    }) as unknown as typeof fetch;

    await fetchWithAuthSession('/api/user-profile', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { reason: 'SESSION_EXPIRED', skipNavigation: true },
      })
    );

    window.removeEventListener(SESSION_EXPIRED_REQUEST_EVENT, listener);
  });

  test('does not treat 401 without bearer as session expiry', async () => {
    const listener = jest.fn();
    window.addEventListener(SESSION_EXPIRED_REQUEST_EVENT, listener);

    global.fetch = jest.fn().mockResolvedValue({
      status: 401,
      clone: () => ({
        json: async () => ({ code: 'SESSION_EXPIRED' }),
      }),
    }) as unknown as typeof fetch;

    await fetchWithAuthSession('/api/albums');

    expect(invalidateAuthSession).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED_REQUEST_EVENT, listener);
  });

  test('dedupes parallel session expiry handling', async () => {
    const listener = jest.fn();
    window.addEventListener(SESSION_EXPIRED_REQUEST_EVENT, listener);

    global.fetch = jest.fn().mockResolvedValue({
      status: 401,
      clone: () => ({
        json: async () => ({ code: 'SESSION_EXPIRED' }),
      }),
    }) as unknown as typeof fetch;

    const init = { headers: { Authorization: 'Bearer test-token' } };
    await Promise.all([fetchWithAuthSession('/api/a', init), fetchWithAuthSession('/api/b', init)]);

    expect(invalidateAuthSession).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_EXPIRED_REQUEST_EVENT, listener);
  });
});
