import { render, screen } from '@testing-library/react';

import { DashboardCard } from '../DashboardCard';

describe('DashboardCard', () => {
  it('renders children', () => {
    render(
      <DashboardCard>
        <p>Card content</p>
      </DashboardCard>
    );

    expect(screen.getByText('Card content')).toBeTruthy();
  });

  it('applies interactive modifier', () => {
    const { container } = render(
      <DashboardCard interactive>
        <p>Interactive</p>
      </DashboardCard>
    );

    expect(container.querySelector('.dashboard-card--interactive')).toBeTruthy();
  });

  it('applies selected modifier', () => {
    const { container } = render(
      <DashboardCard selected>
        <p>Selected</p>
      </DashboardCard>
    );

    expect(container.querySelector('.dashboard-card--selected')).toBeTruthy();
  });

  it('applies disabled modifier', () => {
    const { container } = render(
      <DashboardCard disabled>
        <p>Disabled</p>
      </DashboardCard>
    );

    expect(container.querySelector('.dashboard-card--disabled')).toBeTruthy();
  });

  it('renders as article when specified', () => {
    const { container } = render(
      <DashboardCard as="article">
        <p>Article card</p>
      </DashboardCard>
    );

    expect(container.querySelector('article.dashboard-card')).toBeTruthy();
  });
});
