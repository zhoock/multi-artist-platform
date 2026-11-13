import { getAlbumCoverAdminVariantUrls } from '@shared/lib/albumCoverUrl';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';

export function resolveAlbumPurchaseNotificationCoverUrl(
  notification: UserNotificationItem
): string | null {
  if (notification.type !== 'album_purchase') return null;
  const cover = notification.albumCoverPath;
  const ownerUserId = notification.albumCoverOwnerUserId;
  if (!cover?.trim() || !ownerUserId?.trim()) return null;
  return getAlbumCoverAdminVariantUrls(cover, ownerUserId).webp;
}
