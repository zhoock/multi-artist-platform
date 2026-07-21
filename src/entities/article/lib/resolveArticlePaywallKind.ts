import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';

export type ArticlePaywallKind = 'none' | 'pending' | 'subscription' | 'renew' | 'archive';

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
 * - none: unlocked, or premium + artist already in collection
 * - pending: premium/collection status still loading
 * - renew: in collection, subscription inactive
 * - subscription: not subscribed (and not in collection, or guest path)
 * - archive: subscribed but artist not in collection
 */
export function resolveArticlePaywallKind(options: {
  articleLocked?: boolean;
  isPremium: boolean;
  artistInArchive?: boolean;
  premiumLoading: boolean;
  /** While collection membership is unknown, do not treat as archive gate. */
  archiveLoading?: boolean;
}): ArticlePaywallKind {
  if (options.articleLocked !== true) return 'none';
  if (options.premiumLoading || options.archiveLoading) return 'pending';
  if (!options.isPremium) {
    return options.artistInArchive ? 'renew' : 'subscription';
  }
  if (options.artistInArchive) return 'none';
  return 'archive';
}
