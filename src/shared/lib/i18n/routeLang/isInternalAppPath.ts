import { stripLangPrefix } from './stripLangPrefix';

/**
 * Paths that must never stay under `/:lang/*` — redirect to unprefixed routes.
 * Matches `/dashboard-new`, `/auth`, `/pay/success`, etc.
 */
export function isInternalAppPath(pathname: string): boolean {
  const path = stripLangPrefix(pathname);

  if (
    path.startsWith('/dashboard-new') ||
    path === '/dashboard' ||
    path.startsWith('/dashboard/')
  ) {
    return true;
  }

  if (path === '/auth' || path.startsWith('/auth/')) {
    return true;
  }

  if (path.startsWith('/pay/')) {
    return true;
  }

  if (path === '/email-verified' || path === '/email-verification-expired') {
    return true;
  }

  if (path.startsWith('/help/')) {
    return true;
  }

  return false;
}
