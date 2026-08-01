import { normalizeAlbumReturnPath } from '@shared/lib/albumPurchaseSuccessToast';

import { writeNavigationToastIntent } from './toastNavigationPersistence';

export function armPurchaseSuccessToast(returnTo: string): void {
  const returnPath = normalizeAlbumReturnPath(returnTo);
  if (!returnPath) {
    return;
  }

  writeNavigationToastIntent({ kind: 'purchase-success', returnPath });
}
