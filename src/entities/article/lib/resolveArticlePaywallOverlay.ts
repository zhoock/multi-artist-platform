import type { ArticlePaywallKind } from './resolveArticlePaywallKind';

/**
 * UI-only: defer paywall overlay copy until subscription + collection entitlements settle.
 * Does not affect access decisions (`resolveArticlePaywallKind` / server entitlements).
 */
export function isArticlePaywallOverlayPending(options: {
  showLocked: boolean;
  paywallKind: ArticlePaywallKind;
  premiumLoading: boolean;
  archiveLoading: boolean;
}): boolean {
  if (!options.showLocked || options.paywallKind === 'none') return false;
  return options.premiumLoading || options.archiveLoading || options.paywallKind === 'pending';
}
