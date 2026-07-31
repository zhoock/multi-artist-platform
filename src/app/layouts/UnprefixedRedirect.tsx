import { Navigate, useLocation } from 'react-router-dom';

import { stripLangPrefix } from '@shared/lib/i18n/routeLang';

/** Strips `/:lang` and redirects to the canonical unprefixed internal route. */
export function UnprefixedRedirect() {
  const location = useLocation();
  const target = stripLangPrefix(`${location.pathname}${location.search}${location.hash}`);

  return <Navigate to={target} replace />;
}
