import { useCallback, useEffect, useRef } from 'react';

export type DashboardAccordionOnboardingScope = 'albums' | 'mixer';

type AlbumWithTracks = {
  id: string;
  tracks: Array<{ id: string }>;
};

type UseDashboardAccordionOnboardingOptions<TAlbum extends AlbumWithTracks> = {
  scope: DashboardAccordionOnboardingScope;
  /** Tab is visible and eligible for onboarding (e.g. email verified). */
  enabled: boolean;
  /** Album list is loaded and stable enough to expand. */
  dataReady: boolean;
  albums: TAlbum[];
  expandedAlbumId: string | null;
  expandedTrackId: string | null;
  onExpandAlbum: (albumId: string) => void;
  onExpandTrack: (trackKey: string) => void;
  buildTrackKey: (albumId: string, trackId: string) => string;
  /** Side effects when onboarding expands an album (e.g. preload stems). */
  onAlbumAutoExpand?: (album: TAlbum) => void;
  /** Side effects when onboarding expands a track. */
  onTrackAutoExpand?: (album: TAlbum, trackId: string) => void;
};

const onboardingConsumed: Record<DashboardAccordionOnboardingScope, boolean> = {
  albums: false,
  mixer: false,
};

export function isDashboardAccordionOnboardingConsumed(
  scope: DashboardAccordionOnboardingScope
): boolean {
  return onboardingConsumed[scope];
}

export function markDashboardAccordionOnboardingConsumed(
  scope: DashboardAccordionOnboardingScope
): void {
  onboardingConsumed[scope] = true;
}

/** Resets session onboarding flags — for unit tests only. */
export function resetDashboardAccordionOnboardingForTests(): void {
  onboardingConsumed.albums = false;
  onboardingConsumed.mixer = false;
}

export function useDashboardAccordionOnboarding<TAlbum extends AlbumWithTracks>({
  scope,
  enabled,
  dataReady,
  albums,
  expandedAlbumId,
  expandedTrackId,
  onExpandAlbum,
  onExpandTrack,
  buildTrackKey,
  onAlbumAutoExpand,
  onTrackAutoExpand,
}: UseDashboardAccordionOnboardingOptions<TAlbum>) {
  const pendingTrackKeyRef = useRef<string | null>(null);
  const hasStartedOnboardingRef = useRef(false);

  const markUserInteracted = useCallback(() => {
    markDashboardAccordionOnboardingConsumed(scope);
    pendingTrackKeyRef.current = null;
    hasStartedOnboardingRef.current = false;
  }, [scope]);

  useEffect(() => {
    if (!enabled || !dataReady || isDashboardAccordionOnboardingConsumed(scope)) {
      return;
    }

    if (
      (expandedAlbumId !== null || expandedTrackId !== null) &&
      !hasStartedOnboardingRef.current
    ) {
      markDashboardAccordionOnboardingConsumed(scope);
      return;
    }

    if (hasStartedOnboardingRef.current) {
      return;
    }

    const firstAlbum = albums[0];
    const firstTrack = firstAlbum?.tracks[0];
    if (!firstAlbum || !firstTrack) {
      markDashboardAccordionOnboardingConsumed(scope);
      return;
    }

    hasStartedOnboardingRef.current = true;
    pendingTrackKeyRef.current = buildTrackKey(firstAlbum.id, firstTrack.id);
    onAlbumAutoExpand?.(firstAlbum);
    onExpandAlbum(firstAlbum.id);
  }, [
    albums,
    buildTrackKey,
    dataReady,
    enabled,
    expandedAlbumId,
    expandedTrackId,
    onAlbumAutoExpand,
    onExpandAlbum,
    scope,
  ]);

  useEffect(() => {
    const pendingTrackKey = pendingTrackKeyRef.current;
    if (!pendingTrackKey || isDashboardAccordionOnboardingConsumed(scope)) {
      return;
    }

    const firstAlbum = albums[0];
    const firstTrack = firstAlbum?.tracks[0];
    if (!firstAlbum || !firstTrack) {
      markDashboardAccordionOnboardingConsumed(scope);
      pendingTrackKeyRef.current = null;
      return;
    }

    if (expandedAlbumId !== firstAlbum.id) {
      return;
    }

    if (expandedTrackId === pendingTrackKey) {
      markDashboardAccordionOnboardingConsumed(scope);
      pendingTrackKeyRef.current = null;
      return;
    }

    onTrackAutoExpand?.(firstAlbum, firstTrack.id);
    onExpandTrack(pendingTrackKey);
  }, [albums, expandedAlbumId, expandedTrackId, onExpandTrack, onTrackAutoExpand, scope]);

  return { markUserInteracted };
}
