import { render } from '@testing-library/react';

import { ArticleCoverDisplay } from '@entities/article/ui/ArticleCoverDisplay';

describe('ArticleCoverDisplay', () => {
  test('renders placeholder when img is null', () => {
    render(
      <ArticleCoverDisplay img={null} userId="user-1" role="admin" alt="Article without cover" />
    );

    expect(document.querySelector('.article-cover-placeholder')).toBeTruthy();
    expect(document.querySelector('picture')).toBeNull();
  });
});
