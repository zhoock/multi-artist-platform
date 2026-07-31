import { matchPath } from 'react-router-dom';

import { stripLangPrefix } from '@shared/lib/i18n/routeLang';

/** Standalone service pages rendered without global site chrome. */
export const MINIMAL_LAYOUT_PATHS = [
  '/email-verified',
  '/email-verification-expired',
  '/auth/reset-password',
] as const;

export function isMinimalLayoutPathname(pathname: string): boolean {
  const path = stripLangPrefix(pathname);

  return MINIMAL_LAYOUT_PATHS.some((pattern) => matchPath({ path: pattern, end: true }, path));
}
