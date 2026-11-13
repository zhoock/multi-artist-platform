import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import { formatCollectionAddNotificationBody } from './collectionAddNotification';
import { formatAlbumNotificationBody } from './formatAlbumNotificationBody';

export type UserNotificationRowCopy = {
  commentTitle: string;
  commentReplyTitle: string;
  commentBodyTemplate: string;
  likeTitle: string;
  likeBodyTemplate: string;
  collectionAddTitle: string;
  collectionAddBody: string;
  collectionAddByArtistBody: string;
  albumPurchaseTitle: string;
  albumPurchaseBody: string;
};

/** Maps `ui.header.notifications` dictionary slice to list row copy. */
export function headerNotificationsToRowCopy(
  copy?: {
    newCommentTitle?: string;
    newCommentReplyTitle?: string;
    toAlbum?: string;
    newLikeTitle?: string;
    likedYourCommentOnAlbum?: string;
    newCollectionAddTitle?: string;
    newCollectionAddBody?: string;
    newCollectionAddByArtistBody?: string;
    newAlbumPurchaseTitle?: string;
    newAlbumPurchaseBody?: string;
  } | null
): UserNotificationRowCopy {
  return {
    commentTitle: copy?.newCommentTitle ?? 'New comment',
    commentReplyTitle: copy?.newCommentReplyTitle ?? 'Reply to your comment',
    commentBodyTemplate: copy?.toAlbum ?? 'On album «{{title}}»',
    likeTitle: copy?.newLikeTitle ?? 'New like',
    likeBodyTemplate: copy?.likedYourCommentOnAlbum ?? 'Someone liked your comment on «{{title}}»',
    collectionAddTitle: copy?.newCollectionAddTitle ?? 'Collection',
    collectionAddBody:
      copy?.newCollectionAddBody ?? 'Another listener added you to their collection',
    collectionAddByArtistBody:
      copy?.newCollectionAddByArtistBody ?? '{{name}} added you to their collection',
    albumPurchaseTitle: copy?.newAlbumPurchaseTitle ?? 'Album purchase',
    albumPurchaseBody: copy?.newAlbumPurchaseBody ?? 'Your album “{{title}}” was purchased',
  };
}

export function notificationRowTitle(
  notification: UserNotificationItem,
  copy: UserNotificationRowCopy
): string {
  if (notification.type === 'album_purchase') return copy.albumPurchaseTitle;
  if (notification.type === 'collection_add') return copy.collectionAddTitle;
  if (notification.type === 'comment_like') return copy.likeTitle;
  if (notification.type === 'comment_reply') return copy.commentReplyTitle;
  return copy.commentTitle;
}

export function notificationRowBody(
  notification: UserNotificationItem,
  copy: UserNotificationRowCopy
): string {
  if (notification.type === 'collection_add') {
    return formatCollectionAddNotificationBody(
      notification,
      copy.collectionAddBody,
      copy.collectionAddByArtistBody
    );
  }
  if (notification.type === 'album_purchase') {
    return formatAlbumNotificationBody(notification, copy.albumPurchaseBody);
  }
  const template =
    notification.type === 'comment_like' ? copy.likeBodyTemplate : copy.commentBodyTemplate;
  return formatAlbumNotificationBody(notification, template);
}
