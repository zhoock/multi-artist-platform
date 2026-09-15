import { describe, expect, test, jest, beforeEach } from '@jest/globals';

const getAuthHeaderMock = jest.fn<() => { Authorization: string } | Record<string, never>>();
const fetchWithAuthSessionMock =
  jest.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

jest.mock('@shared/lib/auth', () => ({
  getAuthHeader: () => getAuthHeaderMock(),
}));

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithAuthSessionMock(input, init),
}));

import { createPayment } from '../index';

describe('createPayment auth', () => {
  beforeEach(() => {
    getAuthHeaderMock.mockReset();
    fetchWithAuthSessionMock.mockReset();
  });

  test('does not call payment API when Authorization is missing', async () => {
    getAuthHeaderMock.mockReturnValue({});

    const result = await createPayment({
      albumId: 'album-1',
      customerEmail: 'buyer@example.com',
    });

    expect(result).toEqual({
      success: false,
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
    expect(fetchWithAuthSessionMock).not.toHaveBeenCalled();
  });

  test('sends Authorization header when session exists', async () => {
    getAuthHeaderMock.mockReturnValue({ Authorization: 'Bearer test-token' });
    fetchWithAuthSessionMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, orderId: 'order-1' }),
    } as Response);

    const result = await createPayment({
      albumId: 'album-1',
      customerEmail: 'buyer@example.com',
    });

    expect(result).toEqual({ success: true, orderId: 'order-1' });
    expect(fetchWithAuthSessionMock).toHaveBeenCalledWith(
      '/api/create-payment',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      })
    );
  });
});
