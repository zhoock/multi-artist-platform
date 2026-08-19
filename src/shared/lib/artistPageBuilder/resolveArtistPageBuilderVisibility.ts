export type ArtistPageBuilderMode = 'hidden' | 'active';

export type ArtistPageBuilderHintsPreference = 'show' | 'hide';

export type ArtistPageBuilderVisibility = {
  mode: ArtistPageBuilderMode;
  /** Owner on artist page after onboarding, hints not suppressed. */
  canShowBlocks: boolean;
};

export type ResolveArtistPageBuilderVisibilityInput = {
  isOwner: boolean;
  ownerResolved: boolean;
  ownerContentLoaded: boolean;
  ownerStillNeedsOnboarding: boolean;
  /** Future: user setting «Скрыть подсказки». Defaults to `show`. */
  hintsPreference?: ArtistPageBuilderHintsPreference;
};

/**
 * Single source of truth for owner builder visibility on the public artist page.
 * Wire `hintsPreference` from settings/API when «Скрыть подсказки» ships.
 */
export function resolveArtistPageBuilderVisibility(
  input: ResolveArtistPageBuilderVisibilityInput
): ArtistPageBuilderVisibility {
  const ownerEligible =
    input.isOwner &&
    input.ownerResolved &&
    input.ownerContentLoaded &&
    !input.ownerStillNeedsOnboarding;

  if (!ownerEligible || input.hintsPreference === 'hide') {
    return { mode: 'hidden', canShowBlocks: false };
  }

  return { mode: 'active', canShowBlocks: true };
}

/** Per-section gate: builder replaces empty content only when global visibility allows it. */
export function shouldShowArtistPageBuilderBlock(
  visibility: Pick<ArtistPageBuilderVisibility, 'canShowBlocks'>,
  isSectionEmpty: boolean
): boolean {
  return visibility.canShowBlocks && isSectionEmpty;
}

export type ArtistPageBuilderPaymentStatus = {
  /** False while payment settings / public monetization flag are still loading. */
  resolved: boolean;
  monetizationEnabled: boolean;
};

/**
 * Payment builder CTA: show only when monetization is known to be off.
 * Unknown (`resolved === false`) must not be treated as "not connected".
 */
export function shouldShowArtistPageBuilderPaymentBlock(
  visibility: Pick<ArtistPageBuilderVisibility, 'canShowBlocks'>,
  payment: ArtistPageBuilderPaymentStatus
): boolean {
  if (!payment.resolved) return false;
  return shouldShowArtistPageBuilderBlock(visibility, !payment.monetizationEnabled);
}
