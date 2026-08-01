/** Warm the lazy UserDashboard chunk before opening the dashboard modal. */
export function preloadUserDashboardModule(): void {
  void import('@pages/UserDashboard/UserDashboard');
}

export {
  preloadEditAlbumModal,
  preloadEditArticleModal,
  preloadLyricsModals,
  preloadSyncLyricsModal,
} from '@pages/UserDashboard/lib/dashboardLazyModals';
