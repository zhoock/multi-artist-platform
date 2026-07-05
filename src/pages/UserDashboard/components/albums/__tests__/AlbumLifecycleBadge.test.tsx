import { render } from '@testing-library/react';
import { AlbumLifecycleBadge } from '../AlbumLifecycleBadge';

describe('AlbumLifecycleBadge', () => {
  it('uses draft style for draft (same as article drafts)', () => {
    const { container } = render(<AlbumLifecycleBadge status="draft" lang="en" />);

    expect(container.querySelector('.status-badge--draft')).toBeTruthy();
    expect(container.querySelector('.status-badge--published')).toBeNull();
  });

  it('uses draft style for draft changes', () => {
    const { container } = render(<AlbumLifecycleBadge status="draft-changes" lang="en" />);

    expect(container.querySelector('.status-badge--draft')).toBeTruthy();
  });

  it('uses readyToPublish style, not blue', () => {
    const { container } = render(<AlbumLifecycleBadge status="ready-to-publish" lang="en" />);

    expect(container.querySelector('.status-badge--ready-to-publish')).toBeTruthy();
  });

  it('renders nothing when status is null', () => {
    const { container } = render(<AlbumLifecycleBadge status={null} lang="en" />);

    expect(container.querySelector('.status-badge')).toBeNull();
  });
});
