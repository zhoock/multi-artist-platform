import { render } from '@testing-library/react';
import { AlbumLifecycleBadge } from '../AlbumLifecycleBadge';

describe('AlbumLifecycleBadge', () => {
  it('uses neutral style for draft (same as article drafts)', () => {
    const { container } = render(<AlbumLifecycleBadge status="draft" lang="en" />);

    expect(container.querySelector('.user-dashboard__album-status-badge--neutral')).toBeTruthy();
    expect(container.querySelector('.user-dashboard__album-status-badge--published')).toBeNull();
  });

  it('uses neutral style for draft changes', () => {
    const { container } = render(<AlbumLifecycleBadge status="draft-changes" lang="en" />);

    expect(container.querySelector('.user-dashboard__album-status-badge--neutral')).toBeTruthy();
  });

  it('uses yellow ready style, not blue', () => {
    const { container } = render(<AlbumLifecycleBadge status="ready-to-publish" lang="en" />);

    expect(container.querySelector('.user-dashboard__album-status-badge--ready')).toBeTruthy();
  });

  it('renders nothing when status is null', () => {
    const { container } = render(<AlbumLifecycleBadge status={null} lang="en" />);

    expect(container.querySelector('.user-dashboard__album-status-badge')).toBeNull();
  });
});
