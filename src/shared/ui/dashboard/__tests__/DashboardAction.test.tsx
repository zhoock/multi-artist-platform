import { render, screen } from '@testing-library/react';

import { DashboardAction } from '../DashboardAction';

describe('DashboardAction', () => {
  it('renders button with label', () => {
    render(<DashboardAction onClick={() => undefined}>Change email</DashboardAction>);

    expect(screen.getByRole('button', { name: 'Change email' })).toBeTruthy();
  });

  it('applies destructive modifier', () => {
    const { container } = render(
      <DashboardAction destructive onClick={() => undefined}>
        Delete
      </DashboardAction>
    );

    expect(container.querySelector('.dashboard-action--destructive')).toBeTruthy();
  });
});
