import { render } from '@testing-library/react';

import { DashboardLoadingState, DashboardSpinner } from '../DashboardSpinner';

describe('DashboardSpinner', () => {
  it('renders compact spinner', () => {
    const { container } = render(<DashboardSpinner />);

    expect(container.querySelector('.dashboard-spinner')).toBeTruthy();
  });

  it('supports custom className', () => {
    const { container } = render(<DashboardSpinner className="custom-spinner" />);

    expect(container.querySelector('.dashboard-spinner.custom-spinner')).toBeTruthy();
  });
});

describe('DashboardLoadingState', () => {
  it('renders centered loading state without text', () => {
    const { container } = render(<DashboardLoadingState />);

    const state = container.querySelector('.dashboard-loading-state');
    expect(state).toBeTruthy();
    expect(state?.getAttribute('aria-busy')).toBe('true');
    expect(state?.textContent).toBe('');
    expect(container.querySelector('.dashboard-spinner')).toBeTruthy();
  });
});
