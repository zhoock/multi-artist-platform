import { getHelpCategoryEmptyCopy } from '../getHelpCategoryEmptyCopy';

describe('getHelpCategoryEmptyCopy', () => {
  test('returns dictionary copy when available', () => {
    expect(
      getHelpCategoryEmptyCopy(
        {
          help: {
            categoryEmptyTitle: 'Custom title',
            categoryEmptyDescription: 'Custom description',
          },
        } as never,
        'en'
      )
    ).toEqual({
      title: 'Custom title',
      description: 'Custom description',
    });
  });

  test('falls back to Russian defaults', () => {
    expect(getHelpCategoryEmptyCopy(null, 'ru')).toEqual({
      title: 'Статьи скоро появятся',
      description: 'Мы готовим материалы для этой категории. Загляните позже.',
    });
  });

  test('falls back to English defaults', () => {
    expect(getHelpCategoryEmptyCopy(undefined, 'en')).toEqual({
      title: 'Articles coming soon',
      description: "We're preparing content for this category. Check back later.",
    });
  });
});
