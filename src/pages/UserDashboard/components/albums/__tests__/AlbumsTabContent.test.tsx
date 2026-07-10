import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import type { AlbumData } from '@entities/album/lib/transformAlbumData';
import { renderWithProviders } from '@shared/lib/test-utils';
import { resetDashboardAccordionOnboardingForTests } from '../../../lib/dashboardAccordionOnboarding';
import { AlbumsTabContent } from '../AlbumsTabContent';

const noop = () => undefined;
const asyncNoop = async () => undefined;

function createBaseProps(overrides: Partial<React.ComponentProps<typeof AlbumsTabContent>> = {}) {
  const refs = {
    trackUploadSectionRefs: { current: {} as Record<string, HTMLDivElement | null> },
    fileInputRefs: { current: {} as Record<string, HTMLInputElement | null> },
  };

  return {
    emailVerified: true,
    initialLoading: false,
    tabActive: false,
    albumsData: [] as AlbumData[],
    albumsFromStore: [],
    expandedAlbumId: null,
    onSetExpandedAlbumId: noop,
    albumAccessMenuAlbumId: null,
    publishingAlbumId: null,
    isUploadingTracks: {},
    uploadProgress: {},
    dashboardRowFlashes: {},
    ui: null,
    lang: 'en' as const,
    userId: 'user-1',
    ...refs,
    onCreateAlbum: noop,
    onEditAlbum: noop,
    onToggleAlbum: noop,
    onAlbumAccessMenuChange: noop,
    onAlbumVisibilityChange: noop,
    onTrackUpload: noop,
    onDragEnd: noop,
    onDeleteTrack: noop,
    onTrackTitleChange: asyncNoop,
    onTrackVisibilityChange: asyncNoop,
    onDeleteAlbum: noop,
    onPublishAlbum: noop,
    onLyricsAction: noop,
    ...overrides,
  };
}

const emptyLyrics = (albumId: string, trackId: string) => ({
  albumId,
  trackId,
  lang: 'en',
  content: '',
  syncedLines: null,
  state: 'empty' as const,
  syncedAt: null,
});

const sampleAlbum: AlbumData = {
  id: 'album-1',
  albumId: 'album-1',
  title: 'Test Album',
  artist: 'Test Artist',
  year: '2026',
  isPublic: false,
  isPublished: false,
  tracks: [
    {
      id: 'track-1',
      title: 'Track One',
      order_index: 0,
      duration: '3:00',
      lyrics: emptyLyrics('album-1', 'track-1'),
    },
  ],
};

describe('AlbumsTabContent', () => {
  beforeEach(() => {
    resetDashboardAccordionOnboardingForTests();
  });

  it('renders tab empty state with dashboard kit classes', () => {
    const { container } = render(<AlbumsTabContent {...createBaseProps()} />);

    expect(container.querySelector('.dashboard-empty-state--tab')).toBeTruthy();
    expect(screen.getByText('No albums yet')).toBeTruthy();
  });

  it('renders album row as interactive DashboardCard', () => {
    const { container } = renderWithProviders(
      <AlbumsTabContent
        {...createBaseProps({
          albumsData: [sampleAlbum],
        })}
      />
    );

    const albumCard = container.querySelector(
      '.dashboard-card.user-dashboard__album-card.dashboard-card--interactive'
    );
    expect(albumCard).toBeTruthy();
    expect(container.querySelector('.dashboard-expandable-row-trigger')).toBeTruthy();
  });

  it('renders expanded content inside unified album card body', () => {
    const { container } = renderWithProviders(
      <AlbumsTabContent
        {...createBaseProps({
          albumsData: [sampleAlbum],
          expandedAlbumId: 'album-1',
        })}
      />
    );

    const albumCard = container.querySelector('.user-dashboard__album-card--expanded');
    const expandedBody = container.querySelector('.user-dashboard__album-body');
    expect(albumCard).toBeTruthy();
    expect(expandedBody).toBeTruthy();
    expect(albumCard?.contains(expandedBody)).toBe(true);
    expect(screen.getByText('Test Album')).toBeTruthy();
  });

  it('auto-expands first album and track on first tab open', async () => {
    const onSetExpandedAlbumId = jest.fn();

    const { rerender } = renderWithProviders(
      <AlbumsTabContent
        {...createBaseProps({
          albumsData: [sampleAlbum],
          tabActive: true,
          onSetExpandedAlbumId,
        })}
      />
    );

    await waitFor(() => {
      expect(onSetExpandedAlbumId).toHaveBeenCalledWith('album-1');
    });

    rerender(
      <AlbumsTabContent
        {...createBaseProps({
          albumsData: [sampleAlbum],
          tabActive: true,
          expandedAlbumId: 'album-1',
          onSetExpandedAlbumId,
        })}
      />
    );

    expect(document.querySelector('.user-dashboard__expanded-track-card--expanded')).toBeTruthy();
  });

  it('uses DashboardButton primary for footer upload action', () => {
    const onCreateAlbum = jest.fn();
    const { container } = render(
      <AlbumsTabContent
        {...createBaseProps({
          albumsData: [sampleAlbum],
          onCreateAlbum,
        })}
      />
    );

    const cta = container.querySelector('.dashboard-button--primary');
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toContain('Upload New Album');
  });
});
