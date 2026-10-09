import type { MyArchiveArtist } from '@shared/api/archive';
import type { BillingSnapshot } from '@shared/api/billing';
import { isAutoRenewCollectionRemoveHold } from '@shared/lib/subscription/autoRenewCollectionHold';

import {
  canRemoveCollectionArtist,
  isCollectionArtistActive,
  isCollectionArtistTimeLocked,
} from './collectionLock';
import type { CollectionRemoveButtonMode } from './collectionArtistRemoveTrace';

export function resolveCollectionArtistRemoveButtonMode(params: {
  artist: Pick<MyArchiveArtist, 'isActive' | 'lockedUntil'>;
  hasPremiumAccess: boolean;
  billing: Pick<
    BillingSnapshot,
    'autoRenewEnabled' | 'hasSavedPaymentMethod' | 'nextChargeAt' | 'expiresAt'
  >;
  now: Date;
}): CollectionRemoveButtonMode {
  const { artist, hasPremiumAccess, billing, now } = params;

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
