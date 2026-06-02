export type ArticlePaywallKind = 'none' | 'pending' | 'subscription' | 'archive';

/**
 * Subscription is checked before archive: articleLocked without premium → subscription gate;
 * articleLocked with premium → archive gate.
 */
export function resolveArticlePaywallKind(options: {
  articleLocked?: boolean;
  isPremium: boolean;
  premiumLoading: boolean;
}): ArticlePaywallKind {
  if (options.articleLocked !== true) return 'none';
  if (options.premiumLoading) return 'pending';
  if (!options.isPremium) return 'subscription';
  return 'archive';
}
