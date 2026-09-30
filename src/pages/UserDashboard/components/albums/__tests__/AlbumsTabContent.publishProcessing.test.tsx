import { describe, expect, it, jest } from '@jest/globals';
import { renderWithProviders } from '@shared/lib/test-utils';
import React from 'react';

import type { AlbumEditable } from '@models';

import { AlbumsTabContent } from '../AlbumsTabContent';
import type { AlbumData } from '@entities/album/lib/transformEditableAlbumData';

const noop = () => undefined;
const asyncNoop = async () => undefined;

const emptyLyrics = (albumId: string, trackId: string) => ({
  albumId,
  trackId,
  lang: 'en' as const,
  content: '',
  syncedLines: null,
  state: 'empty' as const,
  syncedAt: null,
});

const uiAlbum: AlbumData = {
  id: 'album-1',
  albumId: 'album-1',
  title: 'Album',
  artist: 'Artist',
  year: '2026',
  isPublic: false,
  isPublished: false,
  tracks: [
    {
      id: 'track-1',
      title: 'Track',
      order_index: 0,
      duration: '3:00',
      processingStatus: 'processing',
      src: '',
      lyrics: emptyLyrics('album-1', 'track-1'),
    },
  ],
};

const storeAlbum: AlbumEditable = {
  albumId: 'album-1',
  album: 'Album',
  artistDisplayName: 'Artist',
  fullName: 'Artist — Album',
  description: 'Description long enough',
  cover: 'cover.jpg',
  release: { date: '2026-01-01', UPC: '123', genreCodes: ['rock'] },
  isPublished: false,
  buttons: {},
  details: [],
  tracks: [
    {
      id: 'track-1',
      title: 'Track',
      order_index: 0,
      duration: 180,
      src: '',
      content: '',
      processingStatus: 'ready',
    },
  ],
};

describe('AlbumsTabContent publish processing UX', () => {
  it('keeps publish disabled with processing hint while UI track is still processing', () => {
    const { container } = renderWithProviders(
      <AlbumsTabContent
        emailVerified
        initialLoading={false}
        tabActive
        albumsData={[uiAlbum]}
        albumsFromStore={[storeAlbum]}
        expandedAlbumId="album-1"
        onSetExpandedAlbumId={noop}
        expandedTrackId={null}
        onSetExpandedTrackId={noop}
        albumAccessMenuAlbumId={null}
        publishingAlbumId={null}
        isUploadingTracks={{}}
        uploadProgress={{}}
        dashboardRowFlashes={{}}
        ui={null}
        lang="en"
        userId="user-1"
        trackUploadSectionRefs={{ current: {} }}
        fileInputRefs={{ current: {} }}
        onCreateAlbum={noop}
        onEditAlbum={noop}
        onToggleAlbum={noop}
        onAlbumAccessMenuChange={noop}
        onAlbumVisibilityChange={asyncNoop}
        onTrackUpload={noop}
        onCancelTrackUpload={noop}
        onDragEnd={noop}
        onDeleteTrack={noop}
        onTrackTitleChange={asyncNoop}
        onTrackVisibilityChange={asyncNoop}
        onDeleteAlbum={noop}
        onPublishAlbum={noop}
        onLyricsAction={noop}
      />
    );

    expect(
      container.querySelector('.user-dashboard__publish-album-button')?.hasAttribute('disabled')
    ).toBe(true);
    expect(container.textContent).toContain('Wait until all tracks finish processing');
    expect(container.textContent).toContain('Processing…');
  });
});
