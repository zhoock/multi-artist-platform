import { isDashboardAppPathname } from '../albumsRouteScope';

describe('isDashboardAppPathname', () => {
  it('matches dashboard routes', () => {
    expect(isDashboardAppPathname('/dashboard')).toBe(true);
    expect(isDashboardAppPathname('/dashboard/settings')).toBe(true);
  });

  it('does not match other app routes', () => {
    expect(isDashboardAppPathname('/')).toBe(false);
    expect(isDashboardAppPathname('/albums/demo')).toBe(false);
    expect(isDashboardAppPathname('/auth')).toBe(false);
  });
});
