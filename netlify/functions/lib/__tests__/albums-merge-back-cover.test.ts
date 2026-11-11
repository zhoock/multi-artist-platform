import { describe, expect, test } from '@jest/globals';
import { pickMergedAlbumBackCover } from '../pick-merged-album-back-cover';

function payload(partial: {
  lang: string;
  updatedAt?: string;
  cover?: string;
  backCover?: string;
}) {
  return {
    albumId: 'demo',
    artistDisplayName: 'Artist',
    album: 'Demo',
    fullName: 'Artist — Demo',
    description: '',
    cover: 'front-base',
    release: {},
    buttons: {},
    details: [],
    tracks: [],
    ...partial,
  };
}

describe('pickMergedAlbumBackCover (GET /api/albums merge)', () => {
  test('returns backCover from freshest locale row', () => {
    const back = pickMergedAlbumBackCover([
      payload({
        lang: 'ru',
        updatedAt: '2024-01-02T00:00:00.000Z',
        backCover: 'back-from-ru',
      }),
      payload({ lang: 'en', updatedAt: '2024-01-01T00:00:00.000Z' }),
    ]);
    expect(back).toBe('back-from-ru');
  });

  test('falls back to older locale when newest row has no backCover', () => {
    const back = pickMergedAlbumBackCover([
      payload({
        lang: 'en',
        updatedAt: '2024-02-01T00:00:00.000Z',
        cover: 'new-front',
      }),
      payload({
        lang: 'ru',
        updatedAt: '2024-01-01T00:00:00.000Z',
        cover: 'front',
        backCover: 'back-preserved',
      }),
    ]);
    expect(back).toBe('back-preserved');
  });

  test('undefined when no locale carried backCover', () => {
    expect(
      pickMergedAlbumBackCover([
        payload({ lang: 'en', updatedAt: '2024-01-01T00:00:00.000Z' }),
        payload({ lang: 'ru', updatedAt: '2024-01-02T00:00:00.000Z' }),
      ])
    ).toBeUndefined();
  });
});
