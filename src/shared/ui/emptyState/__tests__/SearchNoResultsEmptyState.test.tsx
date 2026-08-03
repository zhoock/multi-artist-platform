import { render, screen } from '@testing-library/react';

import { SearchNoResultsEmptyState } from '../SearchNoResultsEmptyState';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'ru' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: () => null,
}));

describe('SearchNoResultsEmptyState', () => {
  test('renders shared ru copy without actions or icon', () => {
    const { container } = render(<SearchNoResultsEmptyState variant="content" />);

    expect(screen.getByRole('status')).toHaveTextContent('Ничего не найдено');
    expect(screen.getByText('Попробуйте изменить запрос')).toBeInTheDocument();
    expect(container.querySelector('.empty-state__icon')).toBeNull();
    expect(container.querySelector('.empty-state__actions')).toBeNull();
  });
});
