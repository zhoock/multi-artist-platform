import { useMemo } from 'react';
import {
  resolveArtistPageBuilderVisibility,
  type ArtistPageBuilderHintsPreference,
  type ArtistPageBuilderVisibility,
} from '@shared/lib/artistPageBuilder';
import { useArtistPageAccess } from './useArtistPageAccess';

export type UseArtistPageBuilderOptions = {
  /** Future: from user settings. Defaults to `show`. */
  hintsPreference?: ArtistPageBuilderHintsPreference;
};

/**
 * Owner-only builder hints on the public artist page.
 */
export function useArtistPageBuilder(
  artistSlug: string,
  options: UseArtistPageBuilderOptions = {}
) {
  const access = useArtistPageAccess(artistSlug);

  const builderVisibility: ArtistPageBuilderVisibility = useMemo(
    () =>
      resolveArtistPageBuilderVisibility({
        isOwner: access.isOwner,
        ownerResolved: access.ownerResolved,
        ownerContentLoaded: access.ownerContentLoaded,
        ownerStillNeedsOnboarding: access.ownerStillNeedsOnboarding,
        hintsPreference: options.hintsPreference ?? 'show',
      }),
    [
      access.isOwner,
      access.ownerResolved,
      access.ownerContentLoaded,
      access.ownerStillNeedsOnboarding,
      options.hintsPreference,
    ]
  );

  return {
    ...access,
    builderVisibility,
    /** @deprecated Prefer `builderVisibility.canShowBlocks`. */
    canShowBuilderBlocks: builderVisibility.canShowBlocks,
  };
}
