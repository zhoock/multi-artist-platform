import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import type { Purchase } from '@shared/api/purchases';
import { MyPurchasesContent } from '../MyPurchasesContent';

const getMyPurchasesMock = jest.fn<() => Promise<Purchase[]>>();
const revokePurchaseMock = jest.fn<(purchaseId: string) => Promise<void>>();

jest.mock('@shared/api/purchases', () => ({
  getMyPurchases: () => getMyPurchasesMock(),
  downloadAlbumZip: jest.fn(),
  revokePurchase: (purchaseId: string) => revokePurchaseMock(purchaseId),
}));

const samplePurchase: Purchase = {
  id: 'purchase-1',
  orderId: 'order-1',
  albumId: 'album-1',
  artistDisplayName: 'Test Artist',
  album: 'Test Album',
  cover: 'cover.jpg',
  purchaseToken: 'token-1',
  purchasedAt: '2026-01-15T12:00:00.000Z',
  downloadCount: 3,
  tracks: [
    { trackId: 'track-1', title: 'Track One' },
    { trackId: 'track-2', title: 'Track Two' },
  ],
};

describe('MyPurchasesContent', () => {
  beforeEach(() => {
    getMyPurchasesMock.mockReset();
    revokePurchaseMock.mockReset();
    sessionStorage.clear();
  });

  it('does not fetch purchases while the tab is inactive', async () => {
    renderWithProviders(<MyPurchasesContent active={false} />);

    await waitFor(() => {
      expect(getMyPurchasesMock).not.toHaveBeenCalled();
    });
  });

  it('fetches purchases once when the tab becomes active', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);

    renderWithProviders(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(getMyPurchasesMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Test Artist — Test Album')).toBeTruthy();
  });

  it('does not refetch when toggling active after a successful load', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);

    const { rerender } = renderWithProviders(<MyPurchasesContent active />);

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

    const { rerender } = renderWithProviders(<MyPurchasesContent active />);

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

    const { container } = renderWithProviders(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(getMyPurchasesMock).toHaveBeenCalled();
    });

    expect(container.querySelector('.dashboard-loading-state.my-purchases__loading')).toBeTruthy();
  });

  it('renders empty state when there are no purchases', async () => {
    getMyPurchasesMock.mockResolvedValue([]);

    const { container } = renderWithProviders(<MyPurchasesContent active />);

    await waitFor(() => {
      expect(container.querySelector('.dashboard-empty-state--tab')).toBeTruthy();
    });
  });

  it('renders purchase card with cover meta and icon actions only', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);

    const { container } = renderWithProviders(<MyPurchasesContent active />);

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

  it('shows success toast after purchase is removed', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);
    revokePurchaseMock.mockResolvedValue(undefined);

    renderWithProviders(<MyPurchasesContent active />);

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

  it('does not show success toast when remove fails', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);
    revokePurchaseMock.mockRejectedValue(new Error('Server error'));

    renderWithProviders(<MyPurchasesContent active />);

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
