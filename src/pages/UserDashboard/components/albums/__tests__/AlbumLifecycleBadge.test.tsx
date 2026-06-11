import { render } from '@testing-library/react';
import { AlbumLifecycleBadge } from '../AlbumLifecycleBadge';

describe('AlbumLifecycleBadge', () => {
  it('uses neutral style for draft (same as article drafts)', () => {
    const { container } = render(<AlbumLifecycleBadge status="draft" lang="en" />);

    expect(container.querySelector('.user-dashboard__album-status-badge--neutral')).toBeTruthy();
    expect(container.querySelector('.user-dashboard__album-status-badge--draft')).toBeNull();
  });

  it('uses yellow ready style, not blue', () => {
    const { container } = render(<AlbumLifecycleBadge status="ready-to-publish" lang="en" />);

    expect(container.querySelector('.user-dashboard__album-status-badge--ready')).toBeTruthy();
  });

  it('uses published and hidden status modifiers', () => {
    const { rerender, container } = render(<AlbumLifecycleBadge status="published" lang="en" />);
    expect(container.querySelector('.user-dashboard__album-status-badge--published')).toBeTruthy();

    rerender(<AlbumLifecycleBadge status="hidden" lang="en" />);
    expect(container.querySelector('.user-dashboard__album-status-badge--hidden')).toBeTruthy();
  });
});
