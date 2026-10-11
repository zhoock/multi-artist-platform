import type { MyArchiveArtist } from '@shared/api/archive';
import {
  buildAutoRenewCollectionHoldBilling,
  isAutoRenewCollectionRemoveHold,
  type AutoRenewCollectionHoldBilling,
} from '@shared/lib/subscription/autoRenewCollectionHold';

import {
  canRemoveCollectionArtist,
  isCollectionArtistActive,
  isCollectionArtistTimeLocked,
} from './collectionLock';
import type { CollectionRemoveButtonMode } from './collectionArtistRemoveTrace';

export type ResolveCollectionArtistRemoveButtonModeParams = {
  artist: Pick<MyArchiveArtist, 'isActive' | 'lockedUntil'>;
  hasPremiumAccess: boolean;
  billing?: Partial<AutoRenewCollectionHoldBilling> | null;
  now: Date;
};

export function resolveCollectionArtistRemoveButtonMode(
  params: ResolveCollectionArtistRemoveButtonModeParams
): CollectionRemoveButtonMode {
  const { artist, hasPremiumAccess, now } = params;
  const billing = buildAutoRenewCollectionHoldBilling({
    billing: params.billing,
    hasPremiumAccess,
  });

  if (!isCollectionArtistActive(artist)) {
    return 'inactive-remove';
  }

  const timeLocked = isCollectionArtistTimeLocked(artist, now);
  const autorenewHold = isAutoRenewCollectionRemoveHold(billing, now);

  if (timeLocked || autorenewHold) {
    return timeLocked ? 'time-lock' : 'renewal-hold';
  }

  if (!hasPremiumAccess) {
    return 'subscription-gate';
  }

  if (canRemoveCollectionArtist(artist, hasPremiumAccess, now)) {
    return 'active-remove';
  }

  return 'subscription-gate';
}
