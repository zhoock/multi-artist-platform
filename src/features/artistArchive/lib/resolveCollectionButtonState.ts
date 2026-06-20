import type { ArchiveStatus } from '@shared/api/archive';

export type ArtistArchiveButtonState =
  | 'hidden'
  | 'loading'
  | 'not_premium'
  | 'can_add'
  | 'in_collection_active'
  | 'in_collection_inactive'
  | 'archive_full'
  | 'adding';

/**
 * Collection membership (artistInArchive) is independent of subscription (isPremium).
 */
export function resolveCollectionButtonState(options: {
  artistUserId: string | null | undefined;
  isOwner: boolean;
  status: ArchiveStatus | null;
  loading: boolean;
  adding: boolean;
  hasToken: boolean;
}): ArtistArchiveButtonState {
  const { artistUserId, isOwner, status, loading, adding, hasToken } = options;

  if (!artistUserId || isOwner) return 'hidden';
  if (adding) return 'adding';
  if (loading && !status) return 'loading';
  if (!hasToken || !status) return 'not_premium';

  if (status.artistInArchive) {
    return status.isPremium ? 'in_collection_active' : 'in_collection_inactive';
  }

  if (!status.isPremium) return 'not_premium';
  if (status.slotsUsed >= status.slotsLimit) return 'archive_full';
  return 'can_add';
}
