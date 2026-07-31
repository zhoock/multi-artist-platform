/**
 * UI-тесты для нового прямого album-checkout flow.
 *
 * Покрывают переход с cart-based UX на single-step checkout:
 *  - валидация формы блокирует createPayment
 *  - валидный submit идёт в createPayment с правильными аргументами
 *  - ошибка createPayment остаётся в форме (не редиректит)
 *  - ownership branch: уже куплено → форма скрыта, виден Download
 *  - пре-заполнение email из auth-сессии как read-only информация
 *  - defensive: album=null не рендерит ничего
 *
 * Сам редирект (`window.location.href = ...`) проверять в jsdom неудобно
 * (location read-only) — ограничиваемся проверкой, что createPayment был
 * вызван с правильным returnUrl/payload.
 */

import React from 'react';
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@shared/lib/test-utils';
import type { AlbumDetails } from '@entities/album/model/albumDetails';

type CreatePaymentResult = {
  success: boolean;
  confirmationUrl?: string;
  orderId?: string;
  error?: string;
  message?: string;
};

const createPaymentMock = jest.fn<(...args: unknown[]) => Promise<CreatePaymentResult>>();
jest.mock('@shared/api/payment', () => ({
  createPayment: (...args: unknown[]) => createPaymentMock(...args),
  CREATE_PAYMENT_ALREADY_OWNED: 'ALREADY_OWNED',
}));

const downloadOwnedAlbumZipByAuthMock = jest.fn<(...args: unknown[]) => Promise<void>>();
const invalidateMyPurchasesCacheMock = jest.fn();
jest.mock('@shared/api/purchases', () => ({
  downloadOwnedAlbumZipByAuth: (...args: unknown[]) => downloadOwnedAlbumZipByAuthMock(...args),
  invalidateMyPurchasesCache: () => invalidateMyPurchasesCacheMock(),
}));

const ownershipState: {
  isOwned: boolean;
  ownedPurchase: { tracks: { trackId: string; title: string }[] } | null;
} = {
  isOwned: false,
  ownedPurchase: null,
};
jest.mock('@entities/service/lib/useAlbumOwnedByViewer', () => ({
  useAlbumOwnedByViewer: () => ownershipState,
}));

let mockUser: {
  id: string;
  email: string;
  name?: string | null;
  accountType?: 'listener' | 'artist';
} | null = null;
jest.mock('@shared/lib/auth', () => ({
  getUser: () => mockUser,
  isAuthenticated: () => mockUser !== null,
  subscribeAuthSession: () => () => {},
  getAuthSessionIdentityKey: () => (mockUser ? `user:${mockUser.id}` : ''),
  readAccountTypeFromStoredToken: () => null,
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({
    displayName: 'Test Artist',
    displayLabel: 'TEST ARTIST',
  }),
}));

jest.mock('@entities/album/ui/AlbumCover', () => ({
  __esModule: true,
  default: () => null,
}));

import { AlbumCheckoutModal } from '../AlbumCheckoutModal';

const testAlbum: AlbumDetails = {
  albumId: 'album-1',
  slug: 'album-1',
  title: 'Sample Album',
  cover: '',
  userId: 'user-1',
  dbAlbumId: '',
  description: '',
  details: [],
  release: {},
  artwork: {
    photographer: '',
    photographerURL: '',
    designer: '',
    designerURL: '',
  },
  purchase: {
    allowDownloadSale: 'yes',
    regularPrice: '4.99',
    currency: 'RUB',
  },
  serviceButtons: {},
  visibility: { isPublished: true, isPublic: true },
  tracks: [
    {
      id: '1',
      title: 'Track A',
      duration: 180,
      src: 'a.mp3',
      orderIndex: 0,
      playbackLocked: false,
      visibility: 'public',
      stemsAvailability: 'hidden',
      audioContainer: null,
      audioCodec: null,
      audioBitrate: null,
      audioSampleRate: null,
      audioBitDepth: null,
      audioChannels: null,
      audioDuration: null,
      audioFileSize: null,
    },
    {
      id: '2',
      title: 'Track B',
      duration: 200,
      src: 'b.mp3',
      orderIndex: 1,
      playbackLocked: false,
      visibility: 'public',
      stemsAvailability: 'hidden',
      audioContainer: null,
      audioCodec: null,
      audioBitrate: null,
      audioSampleRate: null,
      audioBitDepth: null,
      audioChannels: null,
      audioDuration: null,
      audioFileSize: null,
    },
  ],
};

function fillValidForm() {
  fireEvent.click(screen.getByRole('checkbox'));
}

beforeEach(() => {
  createPaymentMock.mockReset();
  downloadOwnedAlbumZipByAuthMock.mockReset();
  invalidateMyPurchasesCacheMock.mockReset();
  ownershipState.isOwned = false;
  ownershipState.ownedPurchase = null;
  mockUser = null;
});

describe('AlbumCheckoutModal', () => {
  test('renders album hero (title, artist, price) when open', () => {
    renderWithProviders(<AlbumCheckoutModal isOpen album={testAlbum} onClose={() => {}} />);

    expect(screen.getByText('Sample Album')).toBeInTheDocument();
    expect(screen.getByText('TEST ARTIST')).toBeInTheDocument();
    expect(screen.getByText('4.99 ₽')).toBeInTheDocument();
  });

  test('blocks submit and surfaces validation errors when form is empty', async () => {
    mockUser = { id: 'u1', email: '', name: '' };
    renderWithProviders(<AlbumCheckoutModal isOpen album={testAlbum} onClose={() => {}} />);

    const submit = screen.getByRole('button', {
      name: /continue to payment|перейти к оплате/i,
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByText(/email is required|введите email/i)).toBeInTheDocument();
    });
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  test('valid submit calls createPayment with album + customer details', async () => {
    mockUser = { id: 'u1', email: 'fan@example.com', name: '' };
    // Никогда не резолвим — чтобы тест не пытался выполнить редирект на
    // confirmationUrl и не нарваться на jsdom location-восстановление.
    createPaymentMock.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<AlbumCheckoutModal isOpen album={testAlbum} onClose={() => {}} />);

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /continue to payment|перейти к оплате/i }));

    await waitFor(() => {
      expect(createPaymentMock).toHaveBeenCalledTimes(1);
    });

    const payload = createPaymentMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      albumId: 'album-1',
      customerEmail: 'fan@example.com',
      billingData: { buyerDisplayName: 'Test Artist' },
    });
    expect(payload).not.toHaveProperty('amount');
    expect(payload).not.toHaveProperty('currency');
    expect(payload).not.toHaveProperty('description');
    expect(typeof payload.returnUrl).toBe('string');
    expect(payload.returnUrl).toContain('/pay/status?returnTo=');
  });

  test('surfaces createPayment error and stays on form', async () => {
    mockUser = { id: 'u1', email: 'fan@example.com', name: '' };
    createPaymentMock.mockResolvedValueOnce({
      success: false,
      error: 'YooKassa unavailable',
    });

    renderWithProviders(<AlbumCheckoutModal isOpen album={testAlbum} onClose={() => {}} />);

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /continue to payment|перейти к оплате/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('YooKassa unavailable');
    });
    expect(screen.getByText('fan@example.com')).toBeInTheDocument();
  });

  test('ALREADY_OWNED switches to download state without showing error code', async () => {
    mockUser = { id: 'u1', email: 'fan@example.com', name: 'Fan' };
    createPaymentMock.mockResolvedValueOnce({
      success: false,
      error: 'ALREADY_OWNED',
      message: 'This album is already in My Purchases.',
    });

    renderWithProviders(<AlbumCheckoutModal isOpen album={testAlbum} onClose={() => {}} />);

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: /continue to payment|перейти к оплате/i }));

    await waitFor(() => {
      expect(invalidateMyPurchasesCacheMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText('ALREADY_OWNED')).not.toBeInTheDocument();
    expect(screen.queryByText('fan@example.com')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /already in my purchases|уже в «мои покупках»/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/this album is already in my purchases/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download album|скачать альбом/i })
    ).toBeInTheDocument();
  });

  test('prefills email as read-only checkout info from profile', () => {
    mockUser = {
      id: 'u1',
      email: 'me@example.com',
      name: 'Zhuk',
      accountType: 'listener',
    };

    renderWithProviders(<AlbumCheckoutModal isOpen album={testAlbum} onClose={() => {}} />);

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('shows already-owned state and download CTA when isOwned=true', async () => {
    ownershipState.isOwned = true;
    ownershipState.ownedPurchase = {
      tracks: [
        { trackId: '1', title: 'Track A' },
        { trackId: '2', title: 'Track B' },
      ],
    };
    downloadOwnedAlbumZipByAuthMock.mockResolvedValueOnce();

    renderWithProviders(<AlbumCheckoutModal isOpen album={testAlbum} onClose={() => {}} />);

    expect(
      screen.getByRole('heading', {
        name: /already in my purchases|уже в «мои покупках»/i,
      })
    ).toBeInTheDocument();
    expect(screen.queryByText(/continue to payment|перейти к оплате/i)).not.toBeInTheDocument();
    expect(createPaymentMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /download album|скачать альбом/i }));

    await waitFor(() => {
      expect(downloadOwnedAlbumZipByAuthMock).toHaveBeenCalledTimes(1);
    });
    const downloadArgs = downloadOwnedAlbumZipByAuthMock.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(downloadArgs).toMatchObject({
      albumId: 'album-1',
      artist: 'Test Artist',
      album: 'Sample Album',
    });
  });

  test('renders nothing when album is null (defensive)', () => {
    const { container } = renderWithProviders(
      <AlbumCheckoutModal isOpen album={null} onClose={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
