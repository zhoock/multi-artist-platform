import { render, screen } from '@testing-library/react';

import { DashboardEmptyState } from '../DashboardEmptyState';
import { DashboardCta } from '../DashboardCta';

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
    expect(screen.getByRole('heading', { level: 3, name: 'No albums yet' })).toBeTruthy();
  });

  it('renders card variant', () => {
    const { container } = render(
      <DashboardEmptyState variant="card" title="Drop tracks here" description="Add stems" />
    );

    expect(container.querySelector('.dashboard-empty-state--card')).toBeTruthy();
    expect(screen.getByText('Drop tracks here')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Drop tracks here' })).toBeNull();
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

  it('accepts DashboardCta as action', () => {
    const { container } = render(
      <DashboardEmptyState
        variant="tab"
        title="No albums yet"
        action={<DashboardCta onClick={() => undefined}>Create album</DashboardCta>}
      />
    );

    expect(container.querySelector('.dashboard-cta')).toBeTruthy();
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
