import { getSearchNoResultsCopy } from '../getSearchNoResultsCopy';

describe('getSearchNoResultsCopy', () => {
  test('returns ui dictionary copy when present', () => {
    expect(
      getSearchNoResultsCopy(
        {
          search: {
            noResultsTitle: 'Custom title',
            noResultsDescription: 'Custom description',
          },
        } as never,
        'en'
      )
    ).toEqual({
      title: 'Custom title',
      description: 'Custom description',
    });
  });

  test('falls back to ru defaults', () => {
    expect(getSearchNoResultsCopy(null, 'ru')).toEqual({
      title: 'Ничего не найдено',
      description: 'Попробуйте изменить запрос',
    });
  });

  test('falls back to en defaults', () => {
    expect(getSearchNoResultsCopy(null, 'en')).toEqual({
      title: 'Nothing found',
      description: 'Try changing your query',
    });
  });
});
