import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { act, screen } from '@testing-library/react';
import { ArtistContactManagerModal } from '../ArtistContactManagerModal';
import { renderWithProviders } from '@shared/lib/test-utils';

const showToast = jest.fn();
const writeText = jest.fn(async () => undefined);
const TEST_MANAGER_EMAIL = 'manager@beatles.com';

jest.mock('@shared/lib/toast/toastApi', () => ({
  toast: { show: (...args: unknown[]) => showToast(...args) },
}));

jest.mock('@shared/ui/popup', () => {
  const actual = jest.requireActual<typeof import('@shared/ui/popup')>('@shared/ui/popup');
  return {
    ...actual,
    Popup: ({ children, isActive }: { children: React.ReactNode; isActive: boolean }) =>
      isActive ? <div data-testid="popup-shell">{children}</div> : null,
    PopupCloseButton: ({ children, ...props }: { children: React.ReactNode }) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
  };
});

const labels = {
  title: 'Связаться с менеджером',
  description: 'По вопросам концертов',
  telegram: 'Telegram',
  email: 'Email',
  close: 'Закрыть',
  emailCopied: 'Email скопирован',
  openTelegram: 'Открыть Telegram',
  copyEmail: 'Скопировать email',
};

describe('ArtistContactManagerModal', () => {
  beforeEach(() => {
    showToast.mockReset();
    writeText.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText },
    });
  });

  test('renders email row when managerEmail is set', () => {
    renderWithProviders(
      <ArtistContactManagerModal
        isOpen
        onClose={() => undefined}
        telegramUrl={null}
        managerEmail={TEST_MANAGER_EMAIL}
        labels={labels}
      />
    );

    expect(screen.getByText(TEST_MANAGER_EMAIL)).toBeInTheDocument();
    expect(screen.queryByText(labels.email)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: labels.openTelegram })).not.toBeInTheDocument();
  });

  test('shows Telegram link when URL is provided', () => {
    renderWithProviders(
      <ArtistContactManagerModal
        isOpen
        onClose={() => undefined}
        telegramUrl="https://t.me/manager"
        managerEmail={null}
        labels={labels}
      />
    );

    const link = screen.getByRole('link', { name: labels.openTelegram });
    expect(link).toHaveAttribute('href', 'https://t.me/manager');
    expect(screen.getByText('@manager')).toBeInTheDocument();
    expect(screen.queryByText(labels.telegram)).not.toBeInTheDocument();
  });

  test('copies manager email to clipboard', async () => {
    renderWithProviders(
      <ArtistContactManagerModal
        isOpen
        onClose={() => undefined}
        telegramUrl={null}
        managerEmail={TEST_MANAGER_EMAIL}
        labels={labels}
      />
    );

    await act(async () => {
      screen.getByRole('button', { name: labels.copyEmail }).click();
    });

    expect(writeText).toHaveBeenCalledWith(TEST_MANAGER_EMAIL);
    expect(showToast).toHaveBeenCalledWith({ title: labels.emailCopied });
  });
});
