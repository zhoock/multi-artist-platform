import { render, screen } from '@testing-library/react';

import { DashboardSection } from '../DashboardSection';

describe('DashboardSection', () => {
  it('renders title and children', () => {
    render(
      <DashboardSection title="General">
        <p>Content</p>
      </DashboardSection>
    );

    expect(screen.getByRole('heading', { level: 3, name: 'General' })).toBeTruthy();
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('renders headingExtra in heading row', () => {
    const { container } = render(
      <DashboardSection title="Profile" headingExtra={<span>Public</span>}>
        <p>Content</p>
      </DashboardSection>
    );

    expect(container.querySelector('.dashboard-section__heading-row')).toBeTruthy();
    expect(screen.getByText('Public')).toBeTruthy();
  });
});
