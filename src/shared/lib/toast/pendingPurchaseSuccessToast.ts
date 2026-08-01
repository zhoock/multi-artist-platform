let pendingPurchaseSuccessReturnPath: string | null = null;

export function setPendingPurchaseSuccessReturnPath(returnPath: string): void {
  pendingPurchaseSuccessReturnPath = returnPath;
}

export function getPendingPurchaseSuccessReturnPath(): string | null {
  return pendingPurchaseSuccessReturnPath;
}

/** One-shot match for future purchase-success gating (e.g. ServiceButtons migration). */
export function tryConsumePendingPurchaseSuccessToast(currentPath: string): boolean {
  if (!pendingPurchaseSuccessReturnPath || pendingPurchaseSuccessReturnPath !== currentPath) {
    return false;
  }

  pendingPurchaseSuccessReturnPath = null;
  return true;
}

/** Test-only helper. */
export function resetPendingPurchaseSuccessToastForTests(): void {
  pendingPurchaseSuccessReturnPath = null;
}
