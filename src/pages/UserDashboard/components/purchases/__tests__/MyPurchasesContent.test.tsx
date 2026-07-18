import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import type { Purchase } from '@shared/api/purchases';
import { MyPurchasesContent } from '../MyPurchasesContent';

const getMyPurchasesMock = jest.fn<() => Promise<Purchase[]>>();

jest.mock('@shared/api/purchases', () => ({
  getMyPurchases: () => getMyPurchasesMock(),
  downloadAlbumZip: jest.fn(),
  revokePurchase: jest.fn(),
}));

const samplePurchase: Purchase = {
  id: 'purchase-1',
  orderId: 'order-1',
  albumId: 'album-1',
  artist: 'Test Artist',
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
  });

  it('renders loading state', async () => {
    getMyPurchasesMock.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        })
    );

    const { container } = renderWithProviders(<MyPurchasesContent />);

    await waitFor(() => {
      expect(getMyPurchasesMock).toHaveBeenCalled();
    });

    expect(container.querySelector('.dashboard-loading-state.my-purchases__loading')).toBeTruthy();
  });

  it('renders empty state when there are no purchases', async () => {
    getMyPurchasesMock.mockResolvedValue([]);

    const { container } = renderWithProviders(<MyPurchasesContent />);

    await waitFor(() => {
      expect(container.querySelector('.dashboard-empty-state--tab')).toBeTruthy();
    });
  });

  it('renders purchase card with cover meta and icon actions only', async () => {
    getMyPurchasesMock.mockResolvedValue([samplePurchase]);

    const { container } = renderWithProviders(<MyPurchasesContent />);

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
});
