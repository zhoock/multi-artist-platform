import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';

export type ArticlePaywallKind =
  | 'none'
  | 'pending'
  | 'subscription'
  | 'renew'
  | 'archive'
  | 'activate';

/** Whether catalog chrome should show subscriber lock (card overlay). */
export function resolveShowLockedArticleCard(options: {
  monetizationEnabled: boolean;
  articleLocked?: boolean;
  visibility?: string | null;
}): boolean {
  if (!options.monetizationEnabled) return false;
  const visibilityNorm = normalizeTrackVisibility(options.visibility);
  return (
    options.articleLocked === true ||
    (visibilityNorm === 'subscribers_only' && options.articleLocked !== false)
  );
}

/**
 * Collection membership is separate from subscription:
 * - none: unlocked, or premium + artist active in collection
 * - pending: premium/collection status still loading
 * - renew: in collection, subscription inactive
 * - subscription: not subscribed (and not in collection, or guest path)
 * - archive: subscribed but artist not in collection
 * - activate: in collection, slot inactive, subscription active
 */
export function resolveArticlePaywallKind(options: {
  articleLocked?: boolean;
  isPremium: boolean;
  artistInArchive?: boolean;
  artistActiveInArchive?: boolean;
  premiumLoading: boolean;
  /** While collection membership is unknown, do not treat as archive gate. */
  archiveLoading?: boolean;
}): ArticlePaywallKind {
  if (options.articleLocked !== true) return 'none';
  if (options.premiumLoading || options.archiveLoading) return 'pending';

  if (options.artistInArchive) {
    if (!options.isPremium) return 'renew';
    const isActive = options.artistActiveInArchive ?? options.isPremium;
    if (!isActive) return 'activate';
    return 'none';
  }

  if (!options.isPremium) return 'subscription';
  return 'archive';
}
