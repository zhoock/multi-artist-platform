import type { ArchiveStatus } from '@shared/api/archive';

export type ArtistArchiveButtonState =
  | 'hidden'
  | 'loading'
  | 'not_premium'
  | 'can_add'
  | 'in_collection_active'
  | 'in_collection_inactive'
  | 'subscription_inactive'
  | 'archive_full'
  | 'adding'
  | 'activating';

/**
 * Collection membership (artistInArchive) is independent of subscription (isPremium).
 */
export function resolveCollectionButtonState(options: {
  artistUserId: string | null | undefined;
  isOwner: boolean;
  status: ArchiveStatus | null;
  loading: boolean;
  adding: boolean;
  activating: boolean;
  hasToken: boolean;
}): ArtistArchiveButtonState {
  const { artistUserId, isOwner, status, loading, adding, activating, hasToken } = options;

  if (!artistUserId || isOwner) return 'hidden';
  if (adding) return 'adding';
  if (activating) return 'activating';
  if (loading && !status) return 'loading';
  if (!hasToken || !status) return 'not_premium';

  if (status.artistInArchive) {
    const isActive = status.artistActiveInArchive ?? status.isPremium;
    if (status.isPremium && isActive) return 'in_collection_active';
    if (status.isPremium && !isActive) return 'in_collection_inactive';
    return 'subscription_inactive';
  }

  if (!status.isPremium) return 'not_premium';
  if (status.slotsUsed >= status.slotsLimit) return 'archive_full';
  return 'can_add';
}
