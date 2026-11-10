import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { ToastProvider } from '@shared/lib/toast/ToastProvider';
import { resetToastStoreForTests } from '@shared/lib/toast/toastStore';
import type { Purchase } from '@shared/api/purchases';
import type { AlbumCoverImageProps } from '@entities/album';
import { MyPurchasesContent } from '../MyPurchasesContent';

const albumCoverImagePropsSpy = jest.fn<(props: AlbumCoverImageProps) => void>();

jest.mock('@entities/album/ui/AlbumCoverImage', () => {
  const actual = jest.requireActual(
    '@entities/album/ui/AlbumCoverImage'
  ) as typeof import('@entities/album/ui/AlbumCoverImage');
  return {
    ...actual,
    AlbumCoverImage: (props: AlbumCoverImageProps) => {
      albumCoverImagePropsSpy(props);
      return actual.AlbumCoverImage(props);
    },
  };
});

const getMyPurchasesMock = jest.fn<() => Promise<Purchase[]>>();
const revokePurchaseMock = jest.fn<(purchaseId: string) => Promise<void>>();
const downloadOwnedAlbumZipByAuthMock =
  jest.fn<
    (params: {
      albumId: string;
      artist: string;
      album: string;
      tracks: { trackId: string; title: string }[];
    }) => Promise<void>
  >();

jest.mock('@shared/api/purchases', () => ({
  getMyPurchases: () => getMyPurchasesMock(),
  downloadOwnedAlbumZipByAuth: (params: {
    albumId: string;
    artist: string;
    album: string;
    tracks: { trackId: string; title: string }[];
  }) => downloadOwnedAlbumZipByAuthMock(params),
  revokePurchase: (purchaseId: string) => revokePurchaseMock(purchaseId),
}));

function renderMyPurchases(ui: React.ReactElement) {
  const result = renderWithProviders(<ToastProvider>{ui}</ToastProvider>);
  return {
    ...result,
    rerender: (nextUi: React.ReactElement) =>
      result.rerender(<ToastProvider>{nextUi}</ToastProvider>),
  };
}

const PURCHASE_ALBUM_USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
const COVER_IMG_BASE = 'album_cover_uuid_artist-Cover-my-purchase';

const samplePurchase: Purchase = {
  id: 'purchase-1',
  orderId: 'order-1',
  albumId: 'album-1',
  albumUserId: PURCHASE_ALBUM_USER_ID,
  artistDisplayName: 'Test Artist',
  album: 'Test Album',
  cover: `${COVER_IMG_BASE}-128.webp`,
  purchasedAt: '2026-01-15T12:00:00.000Z',
  downloadCount: 3,
  tracks: [
    { trackId: 'track-1', title: 'Track One' },
    { trackId: 'track-2', title: 'Track Two' },
  ],
};

describe('MyPurchasesContent', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    getMyPurchasesMock.mockReset();
    revokePurchaseMock.mockReset();
    downloadOwnedAlbumZipByAuthMock.mockReset();
    downloadOwnedAlbumZipByAuthMock.mockResolvedValue(undefined);
    albumCoverImagePropsSpy.mockReset();
    process.env = {
      ...originalEnv,
      VITE_SUPABASE_URL: 'https://jhpvetvfnsklpwswadle.supabase.co',
    };
    sessionStorage.clear();
    resetToastStoreForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('does not fetch purchases while the tab is inactive', async () => {
    renderMyPurchases(<MyPurchasesContent active={false} />);

    await waitFor(() => {
      expect(getMyPurchasesMock).not.toHaveBeenCalled();
    });
  });

  it('fetches purchases once when the tab becomes active', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);

    renderMyPurchases(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(getMyPurchasesMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
  });

  it('does not refetch when toggling active after a successful load', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);

    const { rerender } = renderMyPurchases(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(getMyPurchasesMock).toHaveBeenCalledTimes(1);
    });

    rerender(<MyPurchasesContent active={false} />);
    rerender(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
    });

    expect(getMyPurchasesMock).toHaveBeenCalledTimes(1);
  });

  it('retries loading when the tab is reopened after an error', async () => {
    getMyPurchasesMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([samplePurchase]);

    const { rerender } = renderMyPurchases(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(getMyPurchasesMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Network error')).toBeTruthy();

    rerender(<MyPurchasesContent active={false} />);
    rerender(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(getMyPurchasesMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
    });
  });

  it('renders loading state', async () => {
    getMyPurchasesMock.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        })
    );

    const { container } = renderMyPurchases(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(getMyPurchasesMock).toHaveBeenCalled();
    });

    expect(container.querySelector('.dashboard-loading-state.my-purchases__loading')).toBeTruthy();
  });

  it('renders empty state when there are no purchases', async () => {
    getMyPurchasesMock.mockResolvedValue([]);

    const { container } = renderMyPurchases(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(container.querySelector('.dashboard-empty-state--tab')).toBeTruthy();
    });
  });

  it('renders purchase card with cover meta and icon actions only', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);

    const { container } = renderMyPurchases(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
    });

    expect(container.querySelector('.user-dashboard__section')).toBeTruthy();
    expect(container.querySelector('.dashboard-card')).toBeTruthy();
    expect(container.querySelector('.my-purchases__cover')).toBeTruthy();
    expect(container.querySelector('.my-purchases__tracks-count')).toBeTruthy();
    expect(screen.getByText('2 tracks')).toBeTruthy();
    expect(container.querySelectorAll('.dashboard-row').length).toBe(0);
    expect(container.querySelector('.my-purchases__tracks')).toBeNull();
    expect(screen.queryByText('Track One')).toBeNull();
    expect(screen.queryByText('Track Two')).toBeNull();
    expect(screen.queryByText('Tracks')).toBeNull();
    expect(screen.queryByText(/Show tracks/i)).toBeNull();
    expect(screen.queryByText(/Downloads:/)).toBeNull();
    expect(container.querySelector('.my-purchases__download.dashboard-button--icon')).toBeTruthy();
    expect(
      container.querySelector('.my-purchases__remove.dashboard-button--destructive')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(container.querySelector('.my-purchases__remove-hint')).toBeNull();
  });

  it('downloads album via authenticated flow without purchase token', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);

    renderMyPurchases(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(downloadOwnedAlbumZipByAuthMock).toHaveBeenCalledTimes(1);
    });

    expect(downloadOwnedAlbumZipByAuthMock).toHaveBeenCalledWith({
      albumId: 'album-1',
      artist: 'Test Artist',
      album: 'Test Album',
      tracks: samplePurchase.tracks,
    });
  });

  it('shows success toast after purchase is removed', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);
    revokePurchaseMock.mockResolvedValue(undefined);

    renderMyPurchases(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('Remove purchase?')).toBeTruthy();
    });

    const modal = document.querySelector('.confirmation-modal');
    expect(modal).toBeTruthy();
    fireEvent.click(within(modal as HTMLElement).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(revokePurchaseMock).toHaveBeenCalledWith('purchase-1');
      expect(screen.queryByText('Test Artist — Test Album')).toBeNull();
    });

    expect(screen.getByText('Album removed from purchases')).toBeTruthy();
  });

  describe('album cover formats (regression)', () => {
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

    const objectCover = {
      img: COVER_IMG_BASE,
      playerBackground: {
        primary: [10, 20, 30] as [number, number, number],
        secondary: [40, 50, 60] as [number, number, number],
      },
    };

    const objectCoverPurchase = {
      ...samplePurchase,
      id: 'purchase-jsonb-cover',
      cover: objectCover,
    } as unknown as Purchase;

    const stringCoverPurchase: Purchase = {
      ...samplePurchase,
      id: 'purchase-string-cover',
      cover: `${COVER_IMG_BASE}-128.webp`,
    };

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    function expectNoCoverReplaceRuntimeError() {
      const replaceMessages = consoleErrorSpy.mock.calls
        .map((call) => String(call[0] ?? ''))
        .filter((msg) => /cover\.replace is not a function/i.test(msg));
      expect(replaceMessages).toEqual([]);
    }

    it('renders with object-shaped cover from API without throwing', async () => {
      getMyPurchasesMock.mockResolvedValue([objectCoverPurchase]);

      const { container } = renderMyPurchases(<MyPurchasesContent active />);

      await waitFor(() => {
        expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
      });

      expect(container.querySelector('.my-purchases__cover')).toBeTruthy();
      expect(container.querySelector('.my-purchases__cover-image')).toBeTruthy();
      expect(albumCoverImagePropsSpy).toHaveBeenCalled();
      expect(albumCoverImagePropsSpy.mock.calls.at(-1)?.[0]).toMatchObject({
        cover: objectCover,
        userId: PURCHASE_ALBUM_USER_ID,
        contextAlbumId: 'album-1',
      });
      expectNoCoverReplaceRuntimeError();
    });

    it('still renders with string-shaped cover', async () => {
      getMyPurchasesMock.mockResolvedValue([stringCoverPurchase]);

      const { container } = renderMyPurchases(<MyPurchasesContent active />);

      await waitFor(() => {
        expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
      });

      expect(container.querySelector('.my-purchases__cover-image')).toBeTruthy();
      expect(albumCoverImagePropsSpy).toHaveBeenCalled();
      expect(albumCoverImagePropsSpy.mock.calls.at(-1)?.[0]).toMatchObject({
        cover: `${COVER_IMG_BASE}-128.webp`,
        userId: PURCHASE_ALBUM_USER_ID,
      });
      expectNoCoverReplaceRuntimeError();
    });
  });

  it('does not show success toast when remove fails', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);
    revokePurchaseMock.mockRejectedValue(new Error('Server error'));

    renderMyPurchases(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(screen.getByText('Remove purchase?')).toBeTruthy();
    });

    const modal = document.querySelector('.confirmation-modal');
    fireEvent.click(within(modal as HTMLElement).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(revokePurchaseMock).toHaveBeenCalledWith('purchase-1');
    });

    expect(screen.queryByText('Album removed from purchases')).toBeNull();
    expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
    expect(screen.getByText('Failed to remove purchase. Please try again.')).toBeTruthy();
  });
});
