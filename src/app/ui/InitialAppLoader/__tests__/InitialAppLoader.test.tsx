import { render } from '@testing-library/react';

import { InitialAppLoader, PageRouteLoader } from '../InitialAppLoader';

describe('InitialAppLoader', () => {
  it('portals the dashboard spinner to document.body without loading text', () => {
    render(<InitialAppLoader />);

    const overlay = document.body.querySelector('.initial-app-loader');
    expect(overlay).toBeTruthy();
    expect(overlay?.querySelector('.dashboard-spinner')).toBeTruthy();
    expect(overlay?.textContent).toBe('');
    expect(document.body.textContent).not.toContain('Загрузка');
  });
});

describe('PageRouteLoader', () => {
  it('renders an in-flow spinner without becoming a fullscreen overlay', () => {
    const { container } = render(<PageRouteLoader />);

    const loader = container.querySelector('.page-route-loader');
    expect(loader).toBeTruthy();
    expect(loader?.querySelector('.dashboard-spinner')).toBeTruthy();
    expect(container.querySelector('.initial-app-loader')).toBeNull();
    expect(container.textContent).not.toContain('Загрузка');
  });
});
