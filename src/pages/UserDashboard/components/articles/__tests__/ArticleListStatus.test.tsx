import { render, screen } from '@testing-library/react';
import { ArticleListStatus } from '../ArticleListStatus';

describe('ArticleListStatus', () => {
  it('shows Draft badge for never-published articles', () => {
    render(<ArticleListStatus draftBadge="draft" ui={undefined} lang="en" />);

    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('shows Draft changes badge for published articles with pending edits', () => {
    render(<ArticleListStatus draftBadge="draft-changes" ui={undefined} lang="en" />);

    expect(screen.getByText('Draft changes')).toBeInTheDocument();
  });

  it('renders nothing when no draft badge is needed', () => {
    const { container } = render(<ArticleListStatus draftBadge={null} ui={undefined} lang="en" />);

    expect(container).toBeEmptyDOMElement();
  });
});
