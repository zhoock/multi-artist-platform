import { describe, test, expect, jest } from '@jest/globals';
import { screen } from '@testing-library/react';
import { PublicFullscreenTextModal } from '../PublicFullscreenTextModal';
import { renderWithProviders } from '@shared/lib/test-utils';

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

describe('PublicFullscreenTextModal', () => {
  test('renders fullscreen shell with title and body', () => {
    renderWithProviders(
      <PublicFullscreenTextModal isOpen title="About the band" onClose={() => undefined}>
        <p>Body copy</p>
      </PublicFullscreenTextModal>
    );

    expect(screen.getByTestId('popup-shell')).toBeInTheDocument();
    expect(document.querySelector('.album-comments-fullscreen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'About the band' })).toBeInTheDocument();
    expect(screen.getByText('Body copy')).toBeInTheDocument();
  });
});
