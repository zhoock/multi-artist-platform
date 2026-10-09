import type { BillingSnapshot } from '@shared/api/billing';
import type { MyArchiveArtist, MyArchiveData } from '@shared/api/archive';

/** Stable key for detecting subscription billing changes across archive reloads. */
export function billingSnapshotFingerprint(billing: BillingSnapshot): string {
  return [
    billing.plan ?? '',
    billing.scheduledPlan ?? '',
    billing.slotsLimit,
    billing.status ?? '',
    billing.hasPremiumAccess,
    billing.autoRenewEnabled,
    billing.hasSavedPaymentMethod,
    billing.paymentMethodTitle ?? '',
    billing.nextChargeAt ?? '',
    billing.expiresAt ?? '',
  ].join('|');
}

function artistEntitlementKey(artist: MyArchiveArtist): string {
  return [
    artist.artistUserId,
    artist.isActive ? '1' : '0',
    artist.isLocked ? '1' : '0',
    artist.lockedUntil ?? '',
  ].join(':');
}

/** Detects collection artist rows / slot usage changes (not billing-only). */
export function collectionArchiveEntitlementFingerprint(
  data: Pick<MyArchiveData, 'slotsUsed' | 'inactiveCount' | 'artists'> | null | undefined
): string {
  if (!data) return '';
  const artists = data.artists.map(artistEntitlementKey).join('|');
  return `${data.slotsUsed}|${data.inactiveCount ?? ''}|${artists}`;
}
