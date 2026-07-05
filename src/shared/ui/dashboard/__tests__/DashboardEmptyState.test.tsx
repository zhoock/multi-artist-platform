import { render, screen } from '@testing-library/react';

import { DashboardEmptyState } from '../DashboardEmptyState';

describe('DashboardEmptyState', () => {
  it('renders tab variant', () => {
    const { container } = render(
      <DashboardEmptyState
        variant="tab"
        title="No albums yet"
        description="Create an album to get started."
      />
    );

    expect(container.querySelector('.dashboard-empty-state--tab')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('No albums yet')).toBeTruthy();
  });

  it('renders card variant', () => {
    const { container } = render(
      <DashboardEmptyState variant="card" title="Drop tracks here" description="Add stems" />
    );

    expect(container.querySelector('.dashboard-empty-state--card')).toBeTruthy();
    expect(screen.getByText('Drop tracks here')).toBeTruthy();
  });

  it('renders icon and action', () => {
    render(
      <DashboardEmptyState
        variant="card"
        icon={<span data-testid="icon">icon</span>}
        title="Empty"
        action={<button type="button">Add</button>}
      />
    );

    expect(screen.getByTestId('icon')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });

  it('applies CTA class on action element', () => {
    const { container } = render(
      <DashboardEmptyState
        variant="tab"
        title="No albums yet"
        action={
          <button type="button" className="dashboard-empty-state__cta">
            Create album
          </button>
        }
      />
    );

    expect(container.querySelector('.dashboard-empty-state__cta')).toBeTruthy();
  });

  it('applies multiline description modifier', () => {
    const { container } = render(
      <DashboardEmptyState
        variant="tab"
        title="No purchases yet"
        description={'Line one\nLine two'}
        descriptionMultiline
      />
    );

    expect(container.querySelector('.dashboard-empty-state__description--multiline')).toBeTruthy();
  });
});
