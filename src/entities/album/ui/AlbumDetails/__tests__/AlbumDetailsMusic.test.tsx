import { describe, expect, test } from '@jest/globals';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@shared/lib/test-utils';
import { createMockAlbumDetails } from '@entities/album/model/__tests__/albumDetailsFixtures';
import AlbumDetails from '../AlbumDetails';

const uiDictionaryState = {
  en: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
  ru: {
    status: 'succeeded' as const,
    error: null,
    lastUpdated: null,
    data: [
      {
        titles: {
          music: 'Музыка',
          release: 'Релиз',
          albumCover: 'Обложка Альбома',
          photo: 'Фото',
          design: 'Дизайн',
        },
      },
    ],
  },
};

function renderAlbumDetails(details: ReturnType<typeof createMockAlbumDetails>['details']) {
  const album = createMockAlbumDetails({ details, release: { date: '2026-11-01' } });
  return renderWithProviders(<AlbumDetails album={album} />, {
    preloadedState: {
      lang: { current: 'ru' },
      uiDictionary: uiDictionaryState as never,
    },
    initialEntries: ['/ru/albums/test'],
  });
}

describe('AlbumDetails optional metadata visibility', () => {
  test('hides empty recording section headers on the public album page', () => {
    renderAlbumDetails([
      { id: 7, title: 'Исполнители', content: ['Макс Горелов — Вокал.'] },
      { id: 4, title: 'Запись', content: [{ id: 'r1', url: null }] },
      { id: 5, title: 'Сведение', content: [{ dateFrom: '   ' }] },
      { id: 3, title: 'Мастеринг', content: [' '] },
      { id: 2, title: 'Продюсирование', content: [{ text: ['Макс Горелов', 'Фронтмен'] }] },
    ]);

    expect(screen.getByRole('heading', { level: 2, name: 'Музыка' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Исполнители' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Продюсирование' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Релиз' })).toBeTruthy();

    expect(screen.queryByRole('heading', { level: 3, name: 'Запись' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: 'Сведение' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: 'Мастеринг' })).toBeNull();
  });

  test('hides empty artwork designer header but keeps release block', () => {
    renderWithProviders(
      <AlbumDetails
        album={createMockAlbumDetails({
          details: [],
          release: { date: '2026-11-01' },
          artwork: {
            photographer: '',
            photographerURL: '',
            designer: '   ',
            designerURL: '',
          },
        })}
      />,
      {
        preloadedState: {
          lang: { current: 'ru' },
          uiDictionary: uiDictionaryState as never,
        },
      }
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Релиз' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Обложка Альбома' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: 'Дизайн' })).toBeNull();
  });
});
