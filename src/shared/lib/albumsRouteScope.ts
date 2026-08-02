export function isDashboardAppPathname(pathname: string): boolean {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}

/**
 * Ключ для эффектов «загрузить альбомы в дашборде» без срабатывания при смене вкладки
 * (например /dashboard/albums → /dashboard/posts), чтобы не портить общий Redux
 * и визуальную «загрузку» на фоновой странице под модалкой.
 */
export function getAlbumsDashboardRouteScopeKey(pathname: string): string {
  if (isDashboardAppPathname(pathname)) {
    return '__dashboard__';
  }
  return pathname;
}
