import { render, screen } from '@testing-library/react';

import { DashboardIconButton } from '../DashboardIconButton';

describe('DashboardIconButton', () => {
  it('renders icon button with accessible name', () => {
    render(
      <DashboardIconButton aria-label="Delete track" onClick={() => undefined}>
        <span aria-hidden>X</span>
      </DashboardIconButton>
    );

    expect(screen.getByRole('button', { name: 'Delete track' })).toBeTruthy();
  });

  it('applies destructive modifier', () => {
    const { container } = render(
      <DashboardIconButton destructive aria-label="Delete" onClick={() => undefined}>
        <span aria-hidden>X</span>
      </DashboardIconButton>
    );

    expect(container.querySelector('.dashboard-icon-button--destructive')).toBeTruthy();
  });
});
