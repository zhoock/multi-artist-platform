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

  test('orders music detail blocks: genre, semantic blocks, then custom credits', () => {
    const details = createMockAlbumDetails({
      release: { date: '2020-04-16', genreCodes: ['rock'] },
      details: [
        {
          id: 9,
          title: 'Эта запись была бы невозможна без',
          content: ['Спасибо всем'],
        },
        { id: 2, title: 'Продюсирование', content: ['Producer — role'] },
        { id: 3, title: 'Мастеринг', content: [{ dateFrom: '2020-01-01', studioText: 'CMS' }] },
        { id: 4, title: 'Запись', content: [{ dateFrom: '2019-01-01', studioText: 'Studio' }] },
        { id: 5, title: 'Сведение', content: [{ dateFrom: '2020-02-01', studioText: 'DTH' }] },
        { id: 6, title: 'Сессионные музыканты', content: ['Guest — keys'] },
        { id: 7, title: 'Исполнители', content: ['Artist One'] },
      ],
    });

    const resolved = resolveAlbumDetailsForDisplay(details, 'ru');
    expect(resolved.details.map((d) => d.title)).toEqual([
      'Жанр',
      'Исполнители',
      'Сессионные музыканты',
      'Запись',
      'Сведение',
      'Мастеринг',
      'Продюсирование',
      'Эта запись была бы невозможна без',
    ]);
  });
});
