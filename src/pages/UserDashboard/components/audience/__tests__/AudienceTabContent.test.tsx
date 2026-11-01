import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
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
          avatarUrl: 'https://cdn.example/avatar.jpg',
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
    expect(img).toHaveAttribute('src', 'https://cdn.example/avatar.jpg');
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
});
