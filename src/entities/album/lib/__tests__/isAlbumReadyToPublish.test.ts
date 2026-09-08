import { describe, expect, test } from '@jest/globals';
import type { AlbumEditable } from '@models';

import { getAlbumPublishHintKey, isAlbumReadyToPublish } from '../isAlbumReadyToPublish';

const mockTrack = {
  id: '1',
  title: 'Track 1',
  content: '',
  duration: 180,
  src: 'track.mp3',
  order_index: 10,
};

const readyDraft: AlbumEditable = {
  album: 'Test Album',
  artistDisplayName: 'Artist',
  fullName: 'Artist — Test Album',
  description: 'Description',
  cover: 'album-cover-base',
  release: { date: '2020-01-01', UPC: '123', genreCodes: ['rock'] },
  buttons: {},
  details: [],
  tracks: [mockTrack],
  isPublic: false,
  isPublished: false,
};

describe('isAlbumReadyToPublish', () => {
  test('returns true when draft has cover, legacy track src, and required metadata', () => {
    expect(isAlbumReadyToPublish(readyDraft)).toBe(true);
  });

  test('returns false without cover', () => {
    expect(isAlbumReadyToPublish({ ...readyDraft, cover: '' })).toBe(false);
  });

  test('returns false without tracks', () => {
    expect(isAlbumReadyToPublish({ ...readyDraft, tracks: [] })).toBe(false);
  });

  test('returns false when visible pipeline track is pending', () => {
    expect(
      isAlbumReadyToPublish({
        ...readyDraft,
        tracks: [
          {
            ...mockTrack,
            src: '',
            processingStatus: 'pending',
          },
        ],
      })
    ).toBe(false);
  });

  test('returns true when visible pipeline track is ready (client uses src from store)', () => {
    expect(
      isAlbumReadyToPublish({
        ...readyDraft,
        tracks: [
          {
            ...mockTrack,
            src: 'https://cdn.example/track.opus',
            processingStatus: 'ready',
          },
        ],
      })
    ).toBe(true);
  });
});

describe('getAlbumPublishHintKey', () => {
  test('prioritizes cover before tracks', () => {
    expect(getAlbumPublishHintKey({ ...readyDraft, cover: '', tracks: [] })).toBe('cover');
  });

  test('returns tracks when cover exists but tracks are missing', () => {
    expect(getAlbumPublishHintKey({ ...readyDraft, tracks: [] })).toBe('tracks');
  });

  test('returns processing when visible track is pending', () => {
    expect(
      getAlbumPublishHintKey({
        ...readyDraft,
        tracks: [{ ...mockTrack, src: '', processingStatus: 'processing' }],
      })
    ).toBe('processing');
  });

  test('returns processingFailed when visible track failed', () => {
    expect(
      getAlbumPublishHintKey({
        ...readyDraft,
        tracks: [{ ...mockTrack, src: '', processingStatus: 'failed' }],
      })
    ).toBe('processingFailed');
  });

  test('returns ready for publishable draft', () => {
    expect(getAlbumPublishHintKey(readyDraft)).toBe('ready');
  });
});
