/**
 * Политика: при смене auth identity запускать ли force-refresh публичного каталога.
 * Logout (есть сессия → нет) — нет: clearAuth уже сбросил Redux-каталог, refetch не нужен.
 * Login / смена аккаунта — да: нужны entitlements (unlocked src, playbackLocked).
 */
export function shouldRefreshPublicCatalogOnAuthIdentityChange(
  previousIdentityKey: string,
  nextIdentityKey: string
): boolean {
  if (previousIdentityKey === nextIdentityKey) return false;
  if (!nextIdentityKey.trim()) return false;
  return true;
}
