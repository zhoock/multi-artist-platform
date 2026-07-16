export type ArticlePaywallKind = 'none' | 'pending' | 'subscription' | 'renew' | 'archive';

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
