/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders } from '@shared/lib/test-utils';

import PaymentSuccess from '../PaymentSuccess';

const redirectToAlbumReturnPathMock = jest.fn();

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'ru' }),
}));

jest.mock('@shared/lib/albumPurchaseSuccessToast', () => ({
  redirectToAlbumReturnPath: (...args: unknown[]) => redirectToAlbumReturnPathMock(...args),
}));

jest.mock('@shared/api/purchases', () => ({
  invalidateMyPurchasesCache: jest.fn(),
}));

const returnTo = '/albums/23-remastered?artist=smolyanoe-chuchelko';

function renderSuccessPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/pay/success" element={<PaymentSuccess />} />
    </Routes>,
    {
      initialEntries: [`/pay/success?preview=success&returnTo=${encodeURIComponent(returnTo)}`],
    }
  );
}

describe('PaymentSuccess success outcome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successful purchase keeps success screen open without automatic navigation', async () => {
    jest.useFakeTimers();

    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Покупка завершена' })).toBeTruthy();
    });

    expect(screen.queryByText(/Возвращаемся на страницу альбома/i)).toBeNull();

    jest.advanceTimersByTime(6000);

    expect(redirectToAlbumReturnPathMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Покупка завершена' })).toBeTruthy();

    jest.useRealTimers();
  });

  test('click "Вернуться сейчас" navigates to existing returnTo', async () => {
    renderSuccessPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Вернуться сейчас' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Вернуться сейчас' }));

    expect(redirectToAlbumReturnPathMock).toHaveBeenCalledTimes(1);
    expect(redirectToAlbumReturnPathMock).toHaveBeenCalledWith(returnTo);
  });
});
