/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AlbumDetails } from '@entities/album/model/albumDetails';
import { renderWithProviders } from '@shared/lib/test-utils';

import { ServiceButtons } from '../ServiceButtons';

jest.mock('@entities/service/lib/useYooKassaShopAvailableForAlbum', () => ({
  useYooKassaShopAvailableForAlbum: () => ({ loading: false, available: true }),
}));

const ownershipState = {
  isOwned: false,
  ownedPurchase: null as { tracks: { trackId: string; title: string }[] } | null,
  loading: false,
};

jest.mock('@entities/service/lib/useAlbumOwnedByViewer', () => ({
  useAlbumOwnedByViewer: () => ownershipState,
}));

jest.mock('@features/artistArchive/lib/useArtistArchiveStatus', () => ({
  useArtistArchiveStatus: () => ({ buttonState: 'hidden' }),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({
    displayName: 'Test Artist',
    displayLabel: 'TEST ARTIST',
  }),
}));

jest.mock('@shared/api/purchases', () => ({
  downloadOwnedAlbumZipByAuth: jest.fn(async () => {}),
  invalidateMyPurchasesCache: jest.fn(),
}));

jest.mock('@shared/lib/hooks/useAuthSessionUser', () => ({
  useAuthSessionUser: () => null,
}));

jest.mock('@shared/lib/authIntent', () => ({
  consumePendingAlbumCheckoutForKey: () => false,
}));

jest.mock('@shared/api/payment', () => ({
  createPayment: jest.fn(),
}));

jest.mock('@entities/album/ui/AlbumCover', () => ({
  __esModule: true,
  default: () => null,
}));

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
  serviceButtons: { itunes: 'https://music.apple.com/album/1' },
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
  ],
};

describe('ServiceButtons purchase control', () => {
  beforeEach(() => {
    ownershipState.isOwned = false;
    ownershipState.loading = false;
    ownershipState.ownedPurchase = null;
  });

  test('buy album control is a native button and opens checkout on click and Enter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ServiceButtons album={testAlbum} section="Купить" />, {
      preloadedState: { lang: { current: 'en' } },
    });

    const buyButton = await waitFor(() => screen.getByRole('button', { name: /buy album/i }));
    expect(buyButton.tagName).toBe('BUTTON');
    expect(buyButton).toHaveAttribute('type', 'button');

    await user.click(buyButton);
    expect(await screen.findByText('Sample Album')).toBeTruthy();

    fireEvent.keyDown(buyButton, { key: 'Enter' });
    expect(screen.getAllByText('Sample Album').length).toBeGreaterThan(0);
  });
});
