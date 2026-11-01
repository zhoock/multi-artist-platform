import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import type { ArtistAudienceResponse } from '@shared/api/audience';
import { AudienceTabContent } from '../AudienceTabContent';

const fetchArtistAudienceMock =
  jest.fn<
    (params: {
      period: string;
      tracksLimit?: number;
      supportersLimit?: number;
    }) => Promise<ArtistAudienceResponse>
  >();

jest.mock('@shared/api/audience', () => ({
  fetchArtistAudience: (params: {
    period: string;
    tracksLimit?: number;
    supportersLimit?: number;
  }) => fetchArtistAudienceMock(params),
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

const successPayload: ArtistAudienceResponse = {
  period: '30d',
  listeners: 1,
  plays: 1,
  regularListeners: 0,
  collectionCount: 1,
  listenersTimeline: [{ date: '2026-11-01', listeners: 1 }],
  topTracks: [{ rank: 1, trackId: 'track-1', title: 'Track One', plays: 1 }],
  supporters: [],
  supportersTotal: 0,
  revenue: {
    currency: 'RUB',
    albumSales: 4450,
    subscriberSupport: 8000,
    total: 12450,
  },
};

describe('AudienceTabContent load states', () => {
  beforeEach(() => {
    fetchArtistAudienceMock.mockReset();
  });

  it('renders real metric values when the API succeeds', async () => {
    fetchArtistAudienceMock.mockResolvedValue(successPayload);

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(fetchArtistAudienceMock).toHaveBeenCalledTimes(1);
    });

    const metricsRegion = document.querySelector('.audience-tab__metrics');
    expect(metricsRegion).not.toBeNull();

    await waitFor(() => {
      expect(within(metricsRegion as HTMLElement).getAllByText('1')).toHaveLength(3);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Could not load audience statistics.')).not.toBeInTheDocument();
  });

  it('shows an error banner and unavailable metrics instead of false zeros', async () => {
    fetchArtistAudienceMock.mockRejectedValue(new Error('artist-audience:500'));

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText('Could not load audience statistics.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    const metricsRegion = document.querySelector('.audience-tab__metrics');
    expect(metricsRegion).not.toBeNull();
    expect(within(metricsRegion as HTMLElement).getAllByText('—')).toHaveLength(4);
    expect(within(metricsRegion as HTMLElement).queryByText('0')).not.toBeInTheDocument();

    fetchArtistAudienceMock.mockResolvedValueOnce(successPayload);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(fetchArtistAudienceMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(within(metricsRegion as HTMLElement).getAllByText('1')).toHaveLength(3);
    });
  });

  it('renders revenue breakdown from API data', async () => {
    fetchArtistAudienceMock.mockResolvedValue(successPayload);

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByText('Revenue')).toBeInTheDocument();
    });

    expect(screen.getByText('12,450 ₽')).toBeInTheDocument();
    expect(screen.getByText('Album sales')).toBeInTheDocument();
    expect(screen.getByText('4,450 ₽')).toBeInTheDocument();
    expect(screen.getByText('Subscriber support')).toBeInTheDocument();
    expect(screen.getByText('8,000 ₽')).toBeInTheDocument();
  });

  it('shows unavailable revenue amounts on API error', async () => {
    fetchArtistAudienceMock.mockRejectedValue(new Error('artist-audience:500'));

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const revenuePanel = document.querySelector('.audience-tab__list-card--revenue');
    expect(revenuePanel).not.toBeNull();
    expect(within(revenuePanel as HTMLElement).getAllByText('—')).toHaveLength(3);
    expect(within(revenuePanel as HTMLElement).queryByText('0 ₽')).not.toBeInTheDocument();
  });
});

describe('AudienceTabContent supporters avatars', () => {
  beforeEach(() => {
    fetchArtistAudienceMock.mockReset();
  });

  it('renders supporter photo inside the circular avatar container', async () => {
    fetchArtistAudienceMock.mockResolvedValue({
      ...successPayload,
      supporters: [
        {
          userId: 'user-1',
          displayName: 'Beatles',
          avatarUrl: 'users/user-1/profile/profile-abcd1234-128.webp',
          supportStatus: 'premium',
          addedToCollectionAt: '2026-10-01T12:00:00.000Z',
          publicArtistSlug: 'beatles',
        },
      ],
      supportersTotal: 1,
    });

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByText('Beatles')).toBeInTheDocument();
    });

    const avatar = document.querySelector('.audience-tab__supporter-avatar');
    expect(avatar).not.toBeNull();
    const img = avatar?.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', expect.stringContaining('profile-abcd1234-128.webp'));
    expect(avatar?.querySelector('.audience-tab__supporter-initial')).toBeNull();
  });

  it('renders initial when supporter has no avatar URL', async () => {
    fetchArtistAudienceMock.mockResolvedValue({
      ...successPayload,
      supporters: [
        {
          userId: 'user-2',
          displayName: 'Anna',
          avatarUrl: null,
          supportStatus: 'premium',
          addedToCollectionAt: null,
          publicArtistSlug: null,
        },
      ],
      supportersTotal: 1,
    });

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByText('Anna')).toBeInTheDocument();
    });

    const avatar = document.querySelector('.audience-tab__supporter-avatar');
    expect(avatar?.querySelector('img')).toBeNull();
    expect(avatar?.querySelector('.audience-tab__supporter-initial')).toHaveTextContent('A');
  });

  it('links avatar and name when supporter has a public artist profile', async () => {
    fetchArtistAudienceMock.mockResolvedValue({
      ...successPayload,
      supporters: [
        {
          userId: 'user-1',
          displayName: 'Beatles',
          avatarUrl: null,
          supportStatus: 'premium',
          addedToCollectionAt: null,
          publicArtistSlug: 'beatles',
        },
      ],
      supportersTotal: 1,
    });

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Beatles' })).toBeInTheDocument();
    });

    const expectedPath = buildArtistPagePath('en', 'beatles');
    const nameLink = screen.getByRole('link', { name: 'Beatles' });
    expect(nameLink).toHaveAttribute('href', expectedPath);

    const avatarLink = document.querySelector('.audience-tab__supporter-avatar-link');
    expect(avatarLink).toHaveAttribute('href', expectedPath);
    expect(document.querySelector('.audience-tab__supporter-row--public-artist')).not.toBeNull();
  });

  it('keeps listener supporters static without profile links', async () => {
    fetchArtistAudienceMock.mockResolvedValue({
      ...successPayload,
      supporters: [
        {
          userId: 'user-2',
          displayName: 'User_4F7D',
          avatarUrl: null,
          supportStatus: 'premium',
          addedToCollectionAt: null,
          publicArtistSlug: null,
        },
      ],
      supportersTotal: 1,
    });

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByText('User_4F7D')).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: 'User_4F7D' })).not.toBeInTheDocument();
    expect(document.querySelector('.audience-tab__supporter-avatar-link')).toBeNull();
    expect(document.querySelector('.audience-tab__supporter-row--public-artist')).toBeNull();
  });
});
