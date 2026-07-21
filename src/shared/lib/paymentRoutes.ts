/** Album checkout payment return routes (must stay in sync with yookassa-return-url.ts). */
export const ALBUM_PAY_STATUS_PATH = '/pay/status';
export const ALBUM_PAY_SUCCESS_PATH = '/pay/success';
export const ALBUM_PAY_FAIL_PATH = '/pay/fail';

export const ALBUM_PAY_RETURN_PATHS = [
  ALBUM_PAY_STATUS_PATH,
  ALBUM_PAY_SUCCESS_PATH,
  ALBUM_PAY_FAIL_PATH,
] as const;

export type AlbumPaymentRouteMode = 'resolve' | 'success' | 'fail';

export function albumPaymentModeFromPathname(pathname: string): AlbumPaymentRouteMode {
  if (pathname === ALBUM_PAY_FAIL_PATH) return 'fail';
  if (pathname === ALBUM_PAY_STATUS_PATH) return 'resolve';
  return 'success';
}

export function albumPaymentOutcomePath(status: string | undefined): string {
  return status === 'succeeded' ? ALBUM_PAY_SUCCESS_PATH : ALBUM_PAY_FAIL_PATH;
}
