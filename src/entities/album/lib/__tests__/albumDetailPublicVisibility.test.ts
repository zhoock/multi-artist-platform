import { describe, expect, test } from '@jest/globals';
import { createMockAlbumDetails } from '../../model/__tests__/albumDetailsFixtures';
import { resolveAlbumDetailsForDisplay } from '../resolveAlbumDetailsDisplay';
import {
  filterAlbumDetailContentForPublicDisplay,
  isAlbumDetailContentItemPubliclyVisible,
  pruneEmptyAlbumDetailBlocksForPublicDisplay,
} from '../albumDetailPublicVisibility';

describe('albumDetailPublicVisibility', () => {
  test('all optional blocks filled — all remain visible after prune', () => {
    const details = pruneEmptyAlbumDetailBlocksForPublicDisplay([
      { id: 1, title: 'Жанр', content: ['рок, альтернатива'] },
      { id: 2, title: 'Запись', content: [{ dateFrom: '2019-01-01', studioText: 'Studio A' }] },
      { id: 3, title: 'Сведение', content: [{ dateFrom: '2020-02-01', studioText: 'DTH' }] },
      { id: 4, title: 'Мастеринг', content: [{ dateFrom: '2020-03-01', studioText: 'CMS' }] },
      {
        id: 5,
        title: 'Продюсирование',
        content: [{ text: ['Макс', 'Вокал'], link: 'https://example.com' }],
      },
    ]);
    expect(details.map((d) => d.title)).toEqual([
      'Жанр',
      'Запись',
      'Сведение',
      'Мастеринг',
      'Продюсирование',
    ]);
  });

  test('all optional blocks empty — blocks are removed', () => {
    const details = pruneEmptyAlbumDetailBlocksForPublicDisplay([
      { id: 2, title: 'Запись', content: [{ id: 'a', url: null }] },
      { id: 3, title: 'Сведение', content: [{ dateFrom: '', studioText: '   ', city: '' }] },
      { id: 4, title: 'Мастеринг', content: [] },
      { id: 5, title: 'Продюсирование', content: ['   '] },
    ]);
    expect(details).toEqual([]);
  });

  test('only partially filled optional blocks remain', () => {
    const details = pruneEmptyAlbumDetailBlocksForPublicDisplay([
      { id: 2, title: 'Запись', content: [{ id: 'a', url: null }] },
      {
        id: 5,
        title: 'Продюсирование',
        content: [{ text: ['Макс Горелов', 'Фронтмен'] }],
      },
    ]);
    expect(details.map((d) => d.title)).toEqual(['Продюсирование']);
  });

  test('whitespace-only strings are treated as empty', () => {
    expect(isAlbumDetailContentItemPubliclyVisible('   ')).toBe(false);
    expect(filterAlbumDetailContentForPublicDisplay(['Artist', '   ', 'Guest'])).toEqual([
      'Artist',
      'Guest',
    ]);
  });

  test('empty array elements do not leave placeholder blocks', () => {
    const filtered = filterAlbumDetailContentForPublicDisplay([
      { text: ['', ''] },
      { text: ['Name', 'Role'] },
    ]);
    expect(filtered).toHaveLength(1);
  });

  test('resolveAlbumDetailsForDisplay keeps mandatory release while dropping empty music blocks', () => {
    const album = createMockAlbumDetails({
      release: { date: '2026-11-01', genreCodes: ['rock'] },
      details: [
        { id: 7, title: 'Исполнители', content: ['Макс Горелов — Вокал.'] },
        { id: 4, title: 'Запись', content: [{ id: 'r1', url: null }] },
        { id: 5, title: 'Сведение', content: [{ dateFrom: '   ' }] },
        { id: 3, title: 'Мастеринг', content: [' '] },
        { id: 2, title: 'Продюсирование', content: [{ text: ['Макс Горелов', 'Фронтмен'] }] },
      ],
    });

    const resolved = resolveAlbumDetailsForDisplay(album, 'ru');
    expect(resolved.release?.date).toBe('2026-11-01');
    expect(resolved.details.map((d) => d.title)).toEqual(['Жанр', 'Исполнители', 'Продюсирование']);
    expect(resolved.details.some((d) => d.title === 'Запись')).toBe(false);
  });
});
