import { describe, test, expect, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotFoundPage } from '../NotFoundPage';
import { renderWithProviders } from '@shared/lib/test-utils';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@shared/ui/serviceScreen/ServiceScene', () => ({
  ServiceScene: () => null,
}));

describe('NotFoundPage integration tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('должен отобразить заголовок 404', () => {
    renderWithProviders(<NotFoundPage />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(screen.getByText(/looks like you got lost in space/i)).toBeInTheDocument();
    expect(screen.getByText(/the page you're looking for doesn't exist/i)).toBeInTheDocument();
  });

  test('должен отобразить кнопку "Back to Home"', () => {
    renderWithProviders(<NotFoundPage />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    const button = screen.getByRole('button', { name: /back to home/i });
    expect(button).toBeInTheDocument();
  });

  test('должен вызвать navigate при клике на кнопку', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotFoundPage />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    const button = screen.getByRole('button', { name: /back to home/i });
    await user.click(button);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/en', { replace: true });
    });
  });
});
