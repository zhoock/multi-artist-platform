import { render, screen } from '@testing-library/react';
import { ArticleListStatus } from '../ArticleListStatus';

describe('ArticleListStatus', () => {
  it('shows neutral Draft badge for draft articles', () => {
    render(<ArticleListStatus isDraft ui={undefined} lang="en" />);

    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders nothing for published articles', () => {
    const { container } = render(<ArticleListStatus isDraft={false} ui={undefined} lang="en" />);

    expect(container).toBeEmptyDOMElement();
  });
});
