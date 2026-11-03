import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import type { SupportedLang } from '@shared/model/lang';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import type { ArtistAudienceResponse } from '@shared/api/audience';
import { AudienceTabContent } from '../AudienceTabContent';
import { useArtistAudienceLiveRefresh } from '../useArtistAudienceLiveRefresh';

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

jest.mock('../useArtistAudienceLiveRefresh', () => ({
  useArtistAudienceLiveRefresh: jest.fn(),
}));

const useArtistAudienceLiveRefreshMock = jest.mocked(useArtistAudienceLiveRefresh);

const useLangMock = jest.fn((): { lang: SupportedLang; setLang: () => void } => ({
  lang: 'en',
  setLang: () => {},
}));

jest.mock('../geoAudienceCityRuIndex.json', () => ({
  __esModule: true,
  default: { 'VN|da nang': 'Дананг' },
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => useLangMock(),
}));

const successPayload: ArtistAudienceResponse = {
  period: '30d',
  listeners: 1,
  plays: 1,
  regularListeners: 0,
  collectionCount: 1,
  listenersTimeline: [{ date: '2026-11-01', listeners: 1 }],
  topTracks: [
    {
      rank: 1,
      trackId: 'track-1',
      title: 'Track One',
      plays: 1,
      albumCover: null,
      albumUserId: null,
    },
  ],
  topTracksTotal: 1,
  topCities: [],
  topCitiesTotal: 0,
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
    useArtistAudienceLiveRefreshMock.mockReset();
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

    const scrollTail = document.querySelector('.audience-tab__scroll-tail');
    expect(scrollTail).not.toBeNull();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Could not load audience statistics.')).not.toBeInTheDocument();
  });

  it('applies silent live refresh without returning to the loading shell', async () => {
    let onLiveRefresh: (() => void | Promise<void>) | undefined;
    useArtistAudienceLiveRefreshMock.mockImplementation(({ onRefresh }) => {
      onLiveRefresh = onRefresh;
    });

    fetchArtistAudienceMock.mockResolvedValueOnce(successPayload).mockResolvedValueOnce({
      ...successPayload,
      collectionCount: 2,
      supportersTotal: 1,
      supporters: [
        {
          userId: 'supporter-1',
          displayName: 'Fan',
          avatarUrl: null,
          supportStatus: 'premium' as const,
          addedToCollectionAt: '2026-11-03T10:00:00.000Z',
          publicArtistSlug: null,
        },
      ],
    });

    const { container } = renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(fetchArtistAudienceMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(container.querySelector('.audience-tab')).not.toHaveClass('audience-tab--loading');
    });

    await act(async () => {
      await onLiveRefresh?.();
    });

    await waitFor(() => {
      expect(fetchArtistAudienceMock).toHaveBeenCalledTimes(2);
    });

    expect(container.querySelector('.audience-tab')).not.toHaveClass('audience-tab--loading');
    expect(screen.getByText('Fan')).toBeInTheDocument();
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

describe('AudienceTabContent cities block', () => {
  beforeEach(() => {
    fetchArtistAudienceMock.mockReset();
    useLangMock.mockReturnValue({ lang: 'en', setLang: () => {} });
  });

  it('shows at most two cities and Show all when topCitiesTotal exceeds two', async () => {
    fetchArtistAudienceMock.mockResolvedValue({
      ...successPayload,
      topCities: [
        { rank: 1, city: 'Berlin', countryCode: 'DE', plays: 12 },
        { rank: 2, city: 'Paris', countryCode: 'FR', plays: 8 },
      ],
      topCitiesTotal: 4,
    });

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByText('Berlin')).toBeInTheDocument();
    });

    expect(screen.getByText('Paris')).toBeInTheDocument();
    const citiesCard = document.querySelector('.audience-tab__cities-card') as HTMLElement;
    expect(within(citiesCard).getByRole('button', { name: 'Show all' })).toBeInTheDocument();
  });

  it('hides Show all when there are two or fewer cities', async () => {
    fetchArtistAudienceMock.mockResolvedValue({
      ...successPayload,
      topCities: [{ rank: 1, city: 'Oslo', countryCode: 'NO', plays: 3 }],
      topCitiesTotal: 1,
    });

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByText('Oslo')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument();
  });

  it('renders long city names in the compact list row', async () => {
    const longCity = 'A'.repeat(140);
    fetchArtistAudienceMock.mockResolvedValue({
      ...successPayload,
      topCities: [{ rank: 1, city: longCity, countryCode: 'US', plays: 1 }],
      topCitiesTotal: 1,
    });

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(document.querySelector('.audience-tab__rank-city')).not.toBeNull();
    });

    const cityEl = document.querySelector('.audience-tab__rank-city') as HTMLElement;
    expect(cityEl.textContent).toBe(longCity);
  });

  it('localizes city and country labels when UI language is Russian', async () => {
    useLangMock.mockReturnValue({ lang: 'ru', setLang: () => {} });
    fetchArtistAudienceMock.mockResolvedValue({
      ...successPayload,
      topCities: [{ rank: 1, city: 'Da Nang', countryCode: 'VN', plays: 4 }],
      topCitiesTotal: 1,
    });

    renderWithProviders(<AudienceTabContent active ui={null} />);

    await waitFor(() => {
      expect(screen.getByText('Дананг')).toBeInTheDocument();
    });
    expect(screen.getByText('Вьетнам')).toBeInTheDocument();
  });
});
