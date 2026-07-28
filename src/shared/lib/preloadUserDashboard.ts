/** Warm the lazy UserDashboard chunk before opening the dashboard modal. */
export function preloadUserDashboardModule(): void {
  void import('@pages/UserDashboard/UserDashboard');
}
