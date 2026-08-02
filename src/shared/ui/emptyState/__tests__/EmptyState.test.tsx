import { render, screen } from '@testing-library/react';

import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders tab layout with heading title', () => {
    const { container } = render(
      <EmptyState layout="tab" title="No albums yet" description="Create one to begin." />
    );

    expect(container.querySelector('.empty-state--tab')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'No albums yet' })).toBeTruthy();
  });

  it('renders configured primary and secondary actions', () => {
    render(
      <EmptyState
        layout="card"
        title="Empty"
        primaryAction={{ label: 'Upload tracks', onClick: () => undefined }}
        secondaryAction={{ label: 'Learn more', onClick: () => undefined, variant: 'outline' }}
      />
    );

    expect(screen.getByRole('button', { name: 'Upload tracks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Learn more' })).toBeTruthy();
  });
});
