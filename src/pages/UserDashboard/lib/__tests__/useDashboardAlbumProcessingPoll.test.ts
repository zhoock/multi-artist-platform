import { describe, expect, it } from '@jest/globals';

import type { AlbumEditable } from '@models';
import type { AlbumData } from '@entities/album/lib/transformEditableAlbumData';

import { dashboardAlbumsNeedProcessingRefresh } from '../useDashboardAlbumProcessingPoll';

describe('dashboardAlbumsNeedProcessingRefresh', () => {
  it('requests refresh while UI shows in-progress processing', () => {
    const storeAlbum: AlbumEditable = {
      albumId: 'a1',
      album: 'A',
      artistDisplayName: 'X',
      fullName: 'X — A',
      description: 'd',
      release: { date: '2026-01-01', UPC: '1', genreCodes: ['rock'] },
      cover: 'c.jpg',
      buttons: {},
      details: [],
      tracks: [
        {
          id: 't1',
          title: 'T',
          order_index: 0,
          duration: 60,
          src: '',
          content: '',
          processingStatus: 'ready',
        },
      ],
    };
    const uiAlbum: AlbumData = {
      id: 'a1',
      albumId: 'a1',
      title: 'A',
      artist: 'X',
      year: '2026',
      tracks: [
        {
          id: 't1',
          title: 'T',
          order_index: 0,
          duration: '1:00',
          processingStatus: 'processing',
          src: '',
          lyrics: {
            albumId: 'a1',
            trackId: 't1',
            lang: 'en',
            content: '',
            syncedLines: null,
            state: 'empty',
            syncedAt: null,
          },
        },
      ],
    };

    expect(dashboardAlbumsNeedProcessingRefresh([storeAlbum], [uiAlbum])).toBe(true);
  });

  it('stops requesting refresh when all tracks are playable', () => {
    const album: AlbumData = {
      id: 'a1',
      albumId: 'a1',
      title: 'A',
      artist: 'X',
      year: '2026',
      tracks: [
        {
          id: 't1',
          title: 'T',
          order_index: 0,
          duration: '1:00',
          processingStatus: 'ready',
          src: 'https://cdn/track.opus',
          lyrics: {
            albumId: 'a1',
            trackId: 't1',
            lang: 'en',
            content: '',
            syncedLines: null,
            state: 'empty',
            syncedAt: null,
          },
        },
      ],
    };
    const store: AlbumEditable = {
      albumId: 'a1',
      album: 'A',
      artistDisplayName: 'X',
      fullName: 'X — A',
      description: 'd',
      release: {},
      cover: 'c.jpg',
      buttons: {},
      details: [],
      tracks: [
        {
          id: 't1',
          title: 'T',
          order_index: 0,
          duration: 60,
          src: 'https://cdn/track.opus',
          content: '',
          processingStatus: 'ready',
        },
      ],
    };

    expect(dashboardAlbumsNeedProcessingRefresh([store], [album])).toBe(false);
  });
});
