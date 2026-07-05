import { render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';

import { DashboardCta } from '../DashboardCta';

describe('DashboardCta', () => {
  it('renders a primary button by default', () => {
    render(<DashboardCta onClick={() => undefined}>Upload album</DashboardCta>);

    const button = screen.getByRole('button', { name: 'Upload album' });
    expect(button).toBeTruthy();
    expect(button.className).toContain('dashboard-cta');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('supports loading state with spinner', () => {
    const { container } = render(
      <DashboardCta loading disabled onClick={() => undefined}>
        Saving...
      </DashboardCta>
    );

    expect(container.querySelector('.dashboard-cta--loading')).toBeTruthy();
    expect(container.querySelector('.dashboard-save-spinner')).toBeTruthy();
  });

  it('supports polymorphic Link', () => {
    render(
      <MemoryRouter>
        <DashboardCta as={Link} to="/pricing">
          View pricing
        </DashboardCta>
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: 'View pricing' });
    expect(link.getAttribute('href')).toBe('/pricing');
    expect(link.className).toContain('dashboard-cta');
  });
});
