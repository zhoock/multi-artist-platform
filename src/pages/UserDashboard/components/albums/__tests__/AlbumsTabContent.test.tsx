import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import React from 'react';

import type { AlbumData } from '@entities/album/lib/transformAlbumData';
import { renderWithProviders } from '@shared/lib/test-utils';
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
    albumsData: [] as AlbumData[],
    albumsFromStore: [],
    expandedAlbumId: null,
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
      lyricsStatus: 'empty',
    },
  ],
};

describe('AlbumsTabContent', () => {
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
      '.dashboard-card.user-dashboard__album-item.dashboard-card--interactive'
    );
    expect(albumCard).toBeTruthy();
    expect(container.querySelector('.user-dashboard__expandable-row-trigger')).toBeTruthy();
  });

  it('renders expanded panel as DashboardCard with kit modifier', () => {
    const { container } = renderWithProviders(
      <AlbumsTabContent
        {...createBaseProps({
          albumsData: [sampleAlbum],
          expandedAlbumId: 'album-1',
        })}
      />
    );

    const expanded = container.querySelector(
      '.dashboard-card.user-dashboard__album-expanded.user-dashboard__album-expanded--kit'
    );
    expect(expanded).toBeTruthy();
    expect(screen.getByText('Test Album')).toBeTruthy();
  });

  it('uses dashboard-empty-state__cta for footer upload action', () => {
    const onCreateAlbum = jest.fn();
    const { container } = render(
      <AlbumsTabContent
        {...createBaseProps({
          albumsData: [sampleAlbum],
          onCreateAlbum,
        })}
      />
    );

    const cta = container.querySelector('.dashboard-empty-state__cta');
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toContain('Upload New Album');
  });
});
