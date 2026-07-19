import { describe, expect, test } from '@jest/globals';
import { resolveAlbumDetailsForDisplay } from '../resolveAlbumDetailsDisplay';
import { createMockAlbumDetails } from '../../model/__tests__/albumDetailsFixtures';

describe('resolveAlbumDetailsForDisplay', () => {
  test('applies locale description, artwork and track titles', () => {
    const details = createMockAlbumDetails({
      description: 'EN root',
      tracks: [
        {
          ...createMockAlbumDetails().tracks[0],
          title: 'One',
          translations: {
            en: { title: 'One' },
            ru: { title: 'Один' },
          },
        },
      ],
      translations: {
        ru: {
          fullName: 'Артист — Альбом',
          description: 'RU desc',
          details: [],
          artwork: {
            photographer: 'Анна',
            photographerURL: '',
            designer: '',
            designerURL: '',
          },
        },
      },
    });

    const resolved = resolveAlbumDetailsForDisplay(details, 'ru');
    expect(resolved.description).toBe('RU desc');
    expect(resolved.artwork.photographer).toBe('Анна');
    expect(resolved.tracks[0]?.title).toBe('Один');
  });
});
