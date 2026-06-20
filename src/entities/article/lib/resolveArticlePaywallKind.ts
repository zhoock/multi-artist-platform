export type ArticlePaywallKind = 'none' | 'pending' | 'subscription' | 'renew' | 'archive';

/**
 * Collection membership is separate from subscription:
 * - renew: in collection, subscription inactive
 * - subscription: not subscribed (and not in collection, or guest path)
 * - archive: subscribed but artist not in collection
 */
export function resolveArticlePaywallKind(options: {
  articleLocked?: boolean;
  isPremium: boolean;
  artistInArchive?: boolean;
  premiumLoading: boolean;
}): ArticlePaywallKind {
  if (options.articleLocked !== true) return 'none';
  if (options.premiumLoading) return 'pending';
  if (!options.isPremium) {
    return options.artistInArchive ? 'renew' : 'subscription';
  }
  return 'archive';
}
