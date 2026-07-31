import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { shouldLeaveDeletedArtistPage } from '@shared/lib/accountDeletedSession';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang/buildLocalizedPublicPath';
import { isAuthOverlayPathname } from '@shared/lib/publicArtistContext';

import { buildSessionExpiredAuthTarget } from './sessionExpiredNavigation';
import { buildAuthPath } from '@shared/lib/internalAppUrls';
import { SESSION_EXPIRED_REQUEST_EVENT, type SessionExpiredRequestDetail } from './sessionExpired';

/**
 * Reacts to session-expired signals from fetch/auth layers and opens the auth overlay
 * without a full page reload. Navigation stays in React Router; fetch stays agnostic.
 */
export function SessionExpiredRedirectController() {
  const { lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectInFlightRef = useRef(false);

  const handleSessionExpiredRequest = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<SessionExpiredRequestDetail>).detail;
      if (!detail) return;

      if (detail.skipNavigation || isAuthOverlayPathname(location.pathname)) {
        return;
      }

      if (redirectInFlightRef.current) return;
      redirectInFlightRef.current = true;

      try {
        if (shouldLeaveDeletedArtistPage()) {
          navigate(buildLocalizedPublicPath(lang, '/'), { replace: true });
          return;
        }

        const { returnTo, backgroundLocation } = buildSessionExpiredAuthTarget(location);
        const params = new URLSearchParams({ mode: 'login' });
        params.set('returnTo', returnTo);

        navigate(buildAuthPath(params), { replace: true, state: { backgroundLocation } });
      } finally {
        redirectInFlightRef.current = false;
      }
    },
    [lang, location, navigate]
  );

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_REQUEST_EVENT, handleSessionExpiredRequest);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_REQUEST_EVENT, handleSessionExpiredRequest);
    };
  }, [handleSessionExpiredRequest]);

  return null;
}
