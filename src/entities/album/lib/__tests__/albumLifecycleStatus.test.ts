import { describe, expect, test } from '@jest/globals';
import type { AlbumEditable } from '@models';

import { getAlbumListDraftBadge } from '../albumLifecycleStatus';

describe('getAlbumListDraftBadge', () => {
  const baseAlbum: AlbumEditable = {
    artistDisplayName: '',
    album: 'Test Album',
    fullName: 'Test Album',
    description: 'Description',
    cover: 'album-cover-base',
    release: { date: '2020-01-01', UPC: '123', genreCodes: ['rock'] },
    buttons: {},
    details: [],
    tracks: [
      {
        id: '1',
        title: 'Track 1',
        content: '',
        duration: 180,
        src: 'track.mp3',
        order_index: 10,
      },
    ],
    isPublic: true,
    isPublished: true,
  };

  test('returns null when published without draft changes', () => {
    expect(getAlbumListDraftBadge(baseAlbum)).toBeNull();
  });

  test('returns draft-changes when published with pending edits', () => {
    expect(getAlbumListDraftBadge({ ...baseAlbum, hasDraftChanges: true })).toBe('draft-changes');
  });

  test('returns draft when unpublished', () => {
    expect(
      getAlbumListDraftBadge({ ...baseAlbum, isPublic: true, isPublished: false, tracks: [] })
    ).toBe('draft');
  });

  test('returns ready-to-publish when draft meets requirements', () => {
    expect(getAlbumListDraftBadge({ ...baseAlbum, isPublished: false, isPublic: false })).toBe(
      'ready-to-publish'
    );
  });

  test('returns null for published album even when hidden', () => {
    expect(getAlbumListDraftBadge({ ...baseAlbum, isPublic: false, isPublished: true })).toBeNull();
  });
});
