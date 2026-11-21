import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { act, screen, fireEvent } from '@testing-library/react';
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
  const { PopupContext } = jest.requireActual<typeof import('@shared/ui/popup/PopupContext')>(
    '@shared/ui/popup/PopupContext'
  );
  return {
    ...actual,
    Popup: ({
      children,
      isActive,
      onClose,
    }: {
      children: React.ReactNode;
      isActive: boolean;
      onClose?: () => void;
    }) =>
      isActive ? (
        <PopupContext.Provider
          value={{
            requestClose: () => onClose?.(),
            isCloseBlocked: false,
          }}
        >
          <div data-testid="popup-shell">{children}</div>
        </PopupContext.Provider>
      ) : null,
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

  test('PopupCloseButton closes via dialog (center and edge of hit target)', async () => {
    const onClose = jest.fn();
    renderWithProviders(
      <ArtistContactManagerModal
        isOpen
        onClose={onClose}
        telegramUrl={null}
        managerEmail={TEST_MANAGER_EMAIL}
        labels={labels}
      />
    );

    const close = screen.getByRole('button', { name: labels.close });
    expect(close.closest('.album-comments-fullscreen__header')).not.toBeNull();

    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    const { left, top, width, height } = close.getBoundingClientRect();
    fireEvent.click(close, { clientX: left + width * 0.12, clientY: top + height * 0.88 });
    expect(onClose).toHaveBeenCalledTimes(1);
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
