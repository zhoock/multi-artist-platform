import type { Location } from 'react-router-dom';

export type DashboardOpenIntent = {
  backgroundLocation?: Location;
  openEditAlbumModal?: boolean;
  openNewArticleModal?: boolean;
  /** Artist page builder: «Загрузить обложку» → settings Header Images. */
  scrollToHeaderImages?: boolean;
};

export function readDashboardOpenIntent(state: unknown): DashboardOpenIntent | null {
  if (!state || typeof state !== 'object') return null;
  return state as DashboardOpenIntent;
}

export function stripDashboardOpenIntent(state: DashboardOpenIntent | null): {
  backgroundLocation?: Location;
} {
  if (!state?.backgroundLocation) return {};
  return { backgroundLocation: state.backgroundLocation };
}
