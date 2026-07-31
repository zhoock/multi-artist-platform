import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { isArtistAccount } from '@shared/lib/accountType';
import { isAuthenticated, AUTH_SESSION_CHANGED_EVENT } from '@shared/lib/auth';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import {
  buildOwnArtistPagePath,
  fetchOwnArtistPageState,
  hasPendingArtistOnboarding,
  isDefaultHomePath,
  isOnOwnArtistOnboardingPage,
  shouldTryArtistOnboardingRedirect,
} from '@shared/lib/ownArtistPage';

import { shouldResumePremiumCheckoutAfterAuth } from './premiumCheckoutIntent';
import { clearFirstArtistOnboardingPending } from './artistOnboardingRedirect';

/**
 * Redirects artists without public releases to owner onboarding after registration
 * or when an unverified artist lands on universe home after login.
 */
export function ArtistOnboardingRedirectController() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useLang();
  const viewer = useAuthSessionUser();
  const redirectInFlightRef = useRef(false);
  const redirectedForSessionRef = useRef(false);

  const tryRedirect = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!isAuthenticated()) return;

    const viewerId = viewer?.id?.trim();
    if (!viewerId) return;
    if (!isArtistAccount(viewer)) return;
    if (location.pathname.startsWith('/auth')) return;
    if (location.pathname.startsWith('/pay/')) return;
    if (redirectedForSessionRef.current || redirectInFlightRef.current) return;
    if (shouldResumePremiumCheckoutAfterAuth()) return;

    const pendingRegistration = hasPendingArtistOnboarding(viewer);
    const onDefaultHome = isDefaultHomePath(location.pathname, location.search);
    if (!shouldTryArtistOnboardingRedirect(viewer, { pendingRegistration, onDefaultHome })) {
      return;
    }

    redirectInFlightRef.current = true;

    try {
      const state = await fetchOwnArtistPageState(lang);
      if (pendingRegistration) clearFirstArtistOnboardingPending();

      if (!state.needsOnboarding || !state.publicSlug) return;

      const targetPath = buildOwnArtistPagePath(lang, state.publicSlug);
      if (isOnOwnArtistOnboardingPage(location.pathname, location.search, state.publicSlug)) {
        return;
      }

      redirectedForSessionRef.current = true;
      navigate(targetPath, { replace: true });
    } finally {
      redirectInFlightRef.current = false;
    }
  }, [lang, location.pathname, location.search, navigate, viewer?.id]);

  useEffect(() => {
    void tryRedirect();
  }, [tryRedirect]);

  useEffect(() => {
    const onAuthChanged = () => {
      if (!isAuthenticated()) {
        redirectedForSessionRef.current = false;
        return;
      }
      void tryRedirect();
    };
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onAuthChanged);
  }, [tryRedirect]);

  return null;
}
