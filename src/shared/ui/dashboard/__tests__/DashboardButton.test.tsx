import { render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';

import { DashboardButton } from '../DashboardButton';

describe('DashboardButton', () => {
  it('renders outline button with default type', () => {
    render(
      <DashboardButton variant="outline" onClick={() => undefined}>
        Edit album
      </DashboardButton>
    );

    const button = screen.getByRole('button', { name: 'Edit album' });
    expect(button.className).toContain('dashboard-button--outline');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('renders primary variant with loading state', () => {
    const { container } = render(
      <DashboardButton variant="primary" loading disabled onClick={() => undefined}>
        Save
      </DashboardButton>
    );

    expect(container.querySelector('.dashboard-button--loading')).toBeTruthy();
  });

  it('renders outline destructive variant', () => {
    render(
      <DashboardButton variant="outline" destructive onClick={() => undefined}>
        Delete
      </DashboardButton>
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toContain('dashboard-button--outline');
    expect(button.className).toContain('dashboard-button--destructive');
  });

  it('renders icon variant with destructive modifier', () => {
    const { container } = render(
      <DashboardButton variant="icon" destructive aria-label="Delete" onClick={() => undefined}>
        ×
      </DashboardButton>
    );

    expect(container.querySelector('.dashboard-button--destructive')).toBeTruthy();
  });

  it('supports polymorphic Link', () => {
    render(
      <MemoryRouter>
        <DashboardButton as={Link} to="/dashboard-new/albums" variant="outline">
          Open albums
        </DashboardButton>
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: 'Open albums' });
    expect(link.getAttribute('href')).toBe('/dashboard-new/albums');
    expect(link.className).toContain('dashboard-button--outline');
  });
});
