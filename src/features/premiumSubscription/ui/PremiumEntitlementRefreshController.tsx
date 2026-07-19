import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams, type Location } from 'react-router-dom';

import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';
import { isAuthOverlayPathname } from '@shared/lib/publicArtistContext';

import {
  ARCHIVE_CHANGED_EVENT,
  refreshPremiumContentForArchiveChange,
  SUBSCRIPTION_ACTIVATED_EVENT,
  type EntitlementChangeDetail,
} from '@features/artistArchive';
import { shouldRefreshPublicCatalogOnAuthIdentityChange } from '@features/artistArchive/lib/authEntitlementRefreshPolicy';
import { teardownPlaybackAfterAuthEnd } from '@features/artistArchive/lib/teardownPlaybackAfterAuthEnd';
import { AUTH_SESSION_CHANGED_EVENT, getAuthSessionIdentityKey } from '@shared/lib/auth';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';

import {
  isPremiumCheckoutPending,
  readPremiumCheckoutArtistSlug,
} from '../lib/premiumSuccessModalStorage';

function resolveSlugFromEvent(event: Event): string | undefined {
  const detail = (event as CustomEvent<EntitlementChangeDetail>).detail;
  return detail?.publicArtistSlug?.trim() || undefined;
}

/**
 * Global entitlement refresh: albums, articles, player playlist sync.
 * - Login / account switch / archive / subscription → force public catalog refresh.
 * - Logout → no catalog refetch (clearAuth already wiped Redux); local player teardown only.
 */
export function PremiumEntitlementRefreshController() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { overlayOpen, surfaceLocation } = useDashboardModalShell();

  const resolveSlug = (): string | undefined => {
    if (overlayOpen && surfaceLocation?.search) {
      const fromSurface = new URLSearchParams(surfaceLocation.search).get('artist')?.trim();
      if (fromSurface) return fromSurface;
    }
    if (isAuthOverlayPathname(location.pathname)) {
      const bg = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
      if (bg?.search) {
        const fromBg = new URLSearchParams(bg.search.replace(/^\?/, '')).get('artist')?.trim();
        if (fromBg) return fromBg;
      }
    }
    return searchParams.get('artist')?.trim() || readPremiumCheckoutArtistSlug() || undefined;
  };

  const authIdentityKeyRef = useRef(getAuthSessionIdentityKey());

  useEffect(() => {
    const refresh = (event: Event | null, immediate: boolean) => {
      const slug = (event ? resolveSlugFromEvent(event) : undefined) || resolveSlug();
      refreshPremiumContentForArchiveChange(dispatch, slug, { immediate });
    };

    const onEntitlementChanged = (event: Event) => refresh(event, true);
    const onAuthSessionChanged = () => {
      const previousIdentityKey = authIdentityKeyRef.current;
      const nextIdentityKey = getAuthSessionIdentityKey();
      if (nextIdentityKey === previousIdentityKey) return;
      authIdentityKeyRef.current = nextIdentityKey;

      if (!shouldRefreshPublicCatalogOnAuthIdentityChange(previousIdentityKey, nextIdentityKey)) {
        // Logout (or cleared session): catalog already reset in clearAuth — do not refetch.
        teardownPlaybackAfterAuthEnd(dispatch);
        return;
      }

      refresh(null, true);
    };

    authIdentityKeyRef.current = getAuthSessionIdentityKey();

    window.addEventListener(SUBSCRIPTION_ACTIVATED_EVENT, onEntitlementChanged);
    window.addEventListener(ARCHIVE_CHANGED_EVENT, onEntitlementChanged);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged);
    return () => {
      window.removeEventListener(SUBSCRIPTION_ACTIVATED_EVENT, onEntitlementChanged);
      window.removeEventListener(ARCHIVE_CHANGED_EVENT, onEntitlementChanged);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onAuthSessionChanged);
    };
  }, [
    dispatch,
    overlayOpen,
    searchParams,
    surfaceLocation?.search,
    location.pathname,
    location.state,
  ]);

  useEffect(() => {
    if (!isPremiumCheckoutPending()) return;

    const slug = resolveSlug();
    if (!slug) return;

    refreshPremiumContentForArchiveChange(dispatch, slug, { immediate: true });
  }, [dispatch, location.pathname, location.search, searchParams]);

  return null;
}
