import { describe, test, expect, jest, afterEach } from '@jest/globals';
import { screen, fireEvent } from '@testing-library/react';
import { AlbumPageDescription } from '../AlbumPageDescription';
import { renderWithProviders } from '@shared/lib/test-utils';

jest.mock('@shared/ui/publicFullscreenText', () => ({
  PublicFullscreenTextModal: ({
    children,
    isOpen,
    onClose,
    title,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    onClose: () => void;
    title: string;
  }) =>
    isOpen ? (
      <div data-testid="description-popup" role="dialog" aria-label={title}>
        <button type="button" onClick={onClose}>
          Close
        </button>
        {children}
      </div>
    ) : null,
}));

const uiState = {
  ru: {
    status: 'succeeded' as const,
    error: null,
    data: [
      {
        buttons: { show: 'MORE' },
        titles: { aboutAlbumModalTitle: 'Об альбоме {albumTitle}' },
      },
    ],
    lastUpdated: Date.now(),
  },
  en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
};

describe('AlbumPageDescription', () => {
  const originalScrollHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight'
  );

  afterEach(() => {
    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
    }
    jest.restoreAllMocks();
  });

  test('renders nothing when description is empty', () => {
    const { container } = renderWithProviders(
      <AlbumPageDescription description="   " albumTitle="Test" />,
      {
        preloadedState: { uiDictionary: uiState },
      }
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('shows short description without MORE', () => {
    jest.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: '20px',
    } as CSSStyleDeclaration);
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.classList.contains('album-page-description__measure') ? 40 : 0;
      },
    });

    const { container } = renderWithProviders(
      <AlbumPageDescription description="Short album note." albumTitle="Rubber Soul" />,
      {
        preloadedState: { uiDictionary: uiState },
      }
    );
    expect(container.querySelector('.album-page-description')).toHaveTextContent(
      'Short album note.'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('shows MORE and opens popup for long description', () => {
    jest.spyOn(window, 'getComputedStyle').mockReturnValue({
      lineHeight: '20px',
    } as CSSStyleDeclaration);
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.classList.contains('album-page-description__measure') ? 200 : 0;
      },
    });

    const longText = 'Rubber Soul is the sixth studio album by the Beatles. '.repeat(8).trim();
    renderWithProviders(<AlbumPageDescription description={longText} albumTitle="Rubber Soul" />, {
      preloadedState: { uiDictionary: uiState },
    });

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('MORE');
    fireEvent.click(trigger);
    expect(screen.getByTestId('description-popup')).toHaveAttribute(
      'aria-label',
      'About Rubber Soul'
    );
    expect(screen.getByTestId('description-popup')).toBeInTheDocument();
    expect(screen.getByTestId('description-popup')).toHaveTextContent(longText);
  });
});
