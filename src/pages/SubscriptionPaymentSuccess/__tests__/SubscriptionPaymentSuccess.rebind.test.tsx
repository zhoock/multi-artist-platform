/** @jest-environment jsdom */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders } from '@shared/lib/test-utils';
import type { SubscriptionPaymentStatusResponse } from '@shared/api/subscription';

import SubscriptionPaymentSuccess from '../SubscriptionPaymentSuccess';

const getStatusMock =
  jest.fn<
    (params: { subscriptionPaymentId?: string }) => Promise<SubscriptionPaymentStatusResponse>
  >();
const dispatchActivatedMock = jest.fn();
const navigateMock = jest.fn();

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'ru' }),
}));

jest.mock('@shared/api/subscription', () => ({
  getSubscriptionPaymentStatus: (params: { subscriptionPaymentId?: string }) =>
    getStatusMock(params),
}));

jest.mock('@features/artistArchive', () => ({
  ARCHIVE_CHANGED_EVENT: 'archive:changed',
  dispatchSubscriptionActivated: (...args: unknown[]) => dispatchActivatedMock(...args),
}));

jest.mock('@shared/lib/authIntent', () => ({
  clearPremiumCheckoutAuthIntent: jest.fn(),
}));

jest.mock('@features/premiumSubscription', () => ({
  markPremiumCheckoutPending: jest.fn(),
  savePremiumCheckoutArtistSlug: jest.fn(),
  PREMIUM_CHECKOUT_ARTIST_SLUG_KEY: 'premium-checkout-artist-slug',
}));

jest.mock('@shared/lib/dashboardModalBackground', () => ({
  resolveDashboardModalOpenStateFromStoredBackground: () => ({}),
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom') as typeof import('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function statusResponse(
  overrides: Partial<NonNullable<SubscriptionPaymentStatusResponse['data']>> = {}
): SubscriptionPaymentStatusResponse {
  return {
    success: true,
    data: {
      payment: {
        id: 'pay-1',
        status: 'succeeded',
        paid: true,
        amount: { value: '1.00', currency: 'RUB' },
        metadata: {
          productType: 'premium_subscription',
          kind: 'rebind',
        },
      },
      subscriptionActivated: false,
      paymentMethodUpdated: false,
      staleAfterUnlink: false,
      ...overrides,
    },
  };
}

function renderSuccessPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/pay/subscription-success" element={<SubscriptionPaymentSuccess />} />
    </Routes>,
    {
      initialEntries: [
        '/pay/subscription-success?subscriptionPaymentId=sp-rebind-1&returnTo=/dashboard/subscription',
      ],
    }
  );
}

describe('SubscriptionPaymentSuccess rebind success-flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rebind with staleAfterUnlink shows a terminal stale message', async () => {
    getStatusMock.mockResolvedValue(statusResponse({ staleAfterUnlink: true }));

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText(/карта не была привязана/i)).toBeTruthy();
    });

    expect(screen.queryByText(/Способ оплаты обновлён/i)).toBeNull();
    expect(screen.queryByText(/Premium activated/i)).toBeNull();
    expect(dispatchActivatedMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('rebind succeeded without paymentMethodUpdated keeps polling (transient)', async () => {
    jest.useFakeTimers();
    getStatusMock
      .mockResolvedValueOnce(
        statusResponse({
          payment: {
            id: 'pay-1',
            status: 'pending',
            paid: false,
            amount: { value: '1.00', currency: 'RUB' },
            metadata: {
              productType: 'premium_subscription',
              kind: 'rebind',
            },
          },
        })
      )
      .mockResolvedValueOnce(statusResponse({ paymentMethodUpdated: true }));

    renderSuccessPage();

    await waitFor(() => {
      expect(getStatusMock).toHaveBeenCalledTimes(1);
    });

    await jest.advanceTimersByTimeAsync(3000);

    await waitFor(() => {
      expect(screen.getByText(/Способ оплаты обновлён/i)).toBeTruthy();
    });

    expect(getStatusMock).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  test('rebind with paymentMethodUpdated shows successful payment method update', async () => {
    getStatusMock.mockResolvedValue(statusResponse({ paymentMethodUpdated: true }));

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText(/Способ оплаты обновлён/i)).toBeTruthy();
    });

    expect(dispatchActivatedMock).not.toHaveBeenCalled();
  });

  test('initial succeeded still activates Premium', async () => {
    getStatusMock.mockResolvedValue(
      statusResponse({
        payment: {
          id: 'pay-initial',
          status: 'succeeded',
          paid: true,
          amount: { value: '1.00', currency: 'RUB' },
          metadata: {
            productType: 'premium_subscription',
            kind: 'initial',
          },
        },
        subscriptionActivated: true,
        paymentMethodUpdated: false,
      })
    );

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByText(/Premium activated/i)).toBeTruthy();
    });

    expect(dispatchActivatedMock).toHaveBeenCalled();
  });
});
