import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveAlbumCommentNotificationPath } from '@features/albumComments';
import {
  isCollectionAddPublicActor,
  isListenerCollectionAddNotification,
} from './collectionAddNotification';
import type { RouteLang } from '@shared/lib/i18n/routeLang';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import {
  patchUserNotificationRead,
  type UserNotificationItem,
} from '@shared/lib/userNotificationsApi';

export function useNotificationNavigation(lang: RouteLang) {
  const navigate = useNavigate();

  const openNotification = useCallback(
    async (
      notification: UserNotificationItem,
      options?: { onUnreadCount?: (count: number) => void; beforeNavigate?: () => void }
    ) => {
      if (isListenerCollectionAddNotification(notification)) {
        return;
      }
      if (!notification.isRead) {
        try {
          const { unreadCount } = await patchUserNotificationRead(notification.id);
          options?.onUnreadCount?.(unreadCount);
        } catch {
          /* navigation still proceeds */
        }
      }
      if (notification.type === 'collection_add' && isCollectionAddPublicActor(notification)) {
        options?.beforeNavigate?.();
        navigate(buildArtistPagePath(lang, notification.artistSlug!.trim()));
        return;
      }

      const path = resolveAlbumCommentNotificationPath(lang, {
        kind: 'album',
        albumId: notification.albumId ?? '',
        artistSlug: notification.artistSlug ?? '',
        commentId: notification.commentId ?? '',
      });
      options?.beforeNavigate?.();
      navigate(path);
    },
    [lang, navigate]
  );

  return { openNotification };
}
