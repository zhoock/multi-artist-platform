export type NavigationToastIntent =
  | { kind: 'account-deleted' }
  | { kind: 'purchase-success'; returnPath: string };

const NAVIGATION_TOAST_INTENT_KEY = 'sc-toast-navigation-intent';

function isNavigationToastIntent(value: unknown): value is NavigationToastIntent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const kind = (value as { kind?: unknown }).kind;
  if (kind === 'account-deleted') {
    return true;
  }

  if (kind === 'purchase-success') {
    const returnPath = (value as { returnPath?: unknown }).returnPath;
    return typeof returnPath === 'string' && returnPath.length > 0;
  }

  return false;
}

export function writeNavigationToastIntent(intent: NavigationToastIntent): void {
  try {
    sessionStorage.setItem(NAVIGATION_TOAST_INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* ignore */
  }
}

export function consumeNavigationToastIntent(): NavigationToastIntent | null {
  try {
    const raw = sessionStorage.getItem(NAVIGATION_TOAST_INTENT_KEY);
    if (!raw) {
      return null;
    }

    sessionStorage.removeItem(NAVIGATION_TOAST_INTENT_KEY);
    const parsed: unknown = JSON.parse(raw);
    return isNavigationToastIntent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Test-only helper. */
export function resetNavigationToastPersistenceForTests(): void {
  try {
    sessionStorage.removeItem(NAVIGATION_TOAST_INTENT_KEY);
  } catch {
    /* ignore */
  }
}
