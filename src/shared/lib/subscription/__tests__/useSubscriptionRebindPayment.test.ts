/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { renderHook } from '@testing-library/react';

import { createSubscriptionPaymentMethodRebind } from '@shared/api/subscription';
import { useSubscriptionRebindPayment } from '../useSubscriptionRebindPayment';

const createRebindMock = jest.mocked(createSubscriptionPaymentMethodRebind);

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'ru' }),
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom') as typeof import('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({
      pathname: '/dashboard',
      search: '',
      hash: '',
      state: null,
      key: 'test',
    }),
  };
});

jest.mock('@shared/lib/hooks/useAuthSessionUser', () => ({
  useAuthSessionUser: () => ({ id: 'user-1', isEmailVerified: true }),
}));

jest.mock('@shared/lib/emailVerification', () => ({
  useEmailVerificationCopy: () => ({}),
}));

jest.mock('@shared/lib/auth', () => ({
  getToken: () => 'test-token',
  isEmailVerified: () => true,
}));

jest.mock('@shared/api/subscription', () => ({
  createSubscriptionPaymentMethodRebind: jest.fn(),
}));

describe('useSubscriptionRebindPayment', () => {
  beforeEach(() => {
    createRebindMock.mockReset();
    createRebindMock.mockResolvedValue({
      success: true,
      data: {
        paymentId: 'pay-1',
        confirmationUrl: '',
        subscriptionPaymentId: 'sp-1',
      },
    });
  });

  test('resume flow sends resume-auto-renew intent', async () => {
    const { result } = renderHook(() => useSubscriptionRebindPayment());

    await result.current.startRebind({ resumeAutoRenew: true });

    expect(createRebindMock).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'resume-auto-renew' })
    );
  });

  test('ordinary rebind does not send resume intent', async () => {
    const { result } = renderHook(() => useSubscriptionRebindPayment());

    await result.current.startRebind();

    const payload = createRebindMock.mock.calls[0]?.[0] as { intent?: string } | undefined;
    expect(payload?.intent).toBeUndefined();
  });
});
