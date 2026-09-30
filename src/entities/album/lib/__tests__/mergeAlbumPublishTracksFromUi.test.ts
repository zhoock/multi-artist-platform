import { describe, expect, it } from '@jest/globals';

import type { AlbumEditable } from '@models';

import { mergeAlbumPublishTracksFromUi } from '../mergeAlbumPublishTracksFromUi';
import type { AlbumData } from '../transformEditableAlbumData';

const storeAlbum: AlbumEditable = {
  albumId: 'album-1',
  album: 'Album',
  artistDisplayName: 'Artist',
  fullName: 'Artist — Album',
  description: 'Desc',
  release: { date: '2026-01-01', UPC: '1', genreCodes: ['rock'] },
  cover: 'cover.jpg',
  buttons: {},
  details: [],
  tracks: [
    {
      id: 'track-1',
      title: 'One',
      order_index: 0,
      duration: 180,
      src: '',
      content: '',
      processingStatus: 'ready',
    },
  ],
};

const uiAlbum: AlbumData = {
  id: 'album-1',
  albumId: 'album-1',
  title: 'Album',
  artist: 'Artist',
  year: '2026',
  tracks: [
    {
      id: 'track-1',
      title: 'One',
      order_index: 0,
      duration: '3:00',
      processingStatus: 'processing',
      src: '',
      lyrics: {
        albumId: 'album-1',
        trackId: 'track-1',
        lang: 'en',
        content: '',
        syncedLines: null,
        state: 'empty',
        syncedAt: null,
      },
    },
  ],
};

describe('mergeAlbumPublishTracksFromUi', () => {
  it('prefers UI processing status for publish readiness', () => {
    const merged = mergeAlbumPublishTracksFromUi(storeAlbum, uiAlbum);
    expect(merged.tracks?.[0]?.processingStatus).toBe('processing');
  });
});
