import { render, screen } from '@testing-library/react';

import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders label with dot for draft variant', () => {
    const { container } = render(<StatusBadge variant="draft">Draft</StatusBadge>);

    expect(screen.getByText('Draft')).toBeTruthy();
    expect(container.querySelector('.status-badge--draft')).toBeTruthy();
    expect(container.querySelector('.status-badge__dot')).toBeTruthy();
  });

  it('applies readyToPublish modifier', () => {
    const { container } = render(
      <StatusBadge variant="readyToPublish">Ready to Publish</StatusBadge>
    );

    expect(container.querySelector('.status-badge--ready-to-publish')).toBeTruthy();
  });

  it('applies public modifier', () => {
    const { container } = render(<StatusBadge variant="public">Page is public</StatusBadge>);

    expect(container.querySelector('.status-badge--public')).toBeTruthy();
  });

  it('applies private modifier', () => {
    const { container } = render(<StatusBadge variant="private">Page is private</StatusBadge>);

    expect(container.querySelector('.status-badge--private')).toBeTruthy();
  });

  it('applies notVerified modifier', () => {
    const { container } = render(<StatusBadge variant="notVerified">Not verified</StatusBadge>);

    expect(container.querySelector('.status-badge--not-verified')).toBeTruthy();
  });
});
