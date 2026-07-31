import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { parseLangFromPath, type ParsedLangPath } from './parseLangFromPath';

export type LangFromRoute = ParsedLangPath & {
  /** True when the current pathname starts with `/ru` or `/en`. */
  hasLangPrefix: boolean;
};

/**
 * Reads locale from the current React Router pathname.
 * Safe to import before `/:lang` routes exist — returns `lang: null` on unprefixed paths.
 */
export function useLangFromRoute(): LangFromRoute {
  const { pathname } = useLocation();

  return useMemo(() => {
    const parsed = parseLangFromPath(pathname);
    return {
      ...parsed,
      hasLangPrefix: parsed.lang !== null,
    };
  }, [pathname]);
}
