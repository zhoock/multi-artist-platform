import clsx from 'clsx';
import {
  CornerUpLeft as CornerUpLeftIcon,
  Heart as HeartIcon,
  HeartHandshake as HeartHandshakeIcon,
  MessageCircle as MessageCircleIcon,
  ShoppingBag as ShoppingBagIcon,
} from 'lucide-react';
import { formatNotificationRelativeTime } from '@shared/lib/formatNotificationRelativeTime';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import { AlbumCommentAvatar } from '@features/albumComments/ui/AlbumCommentAvatar';
import {
  isCollectionAddPublicActor,
  isListenerCollectionAddNotification,
} from '../lib/collectionAddNotification';
import {
  notificationRowBody,
  notificationRowTitle,
  type UserNotificationRowCopy,
} from '../lib/notificationRowCopy';
import { resolveAlbumPurchaseNotificationCoverUrl } from '../lib/albumPurchaseNotificationCover';
import './userNotificationList.scss';

type UserNotificationListProps = {
  items: UserNotificationItem[];
  lang: string;
  copy: UserNotificationRowCopy;
  emptyLabel?: string;
  onItemClick: (item: UserNotificationItem) => void;
  footer?: React.ReactNode;
};

export function UserNotificationList({
  items,
  lang,
  copy,
  emptyLabel,
  onItemClick,
  footer,
}: UserNotificationListProps) {
  if (items.length === 0 && emptyLabel) {
    return <p className="user-notification-list__empty">{emptyLabel}</p>;
  }

  return (
    <>
      {items.length > 0 ? (
        <ul className="user-notification-list">
          {items.map((n) => {
            const collectionActor = isCollectionAddPublicActor(n);
            const staticListenerCollectionAdd = isListenerCollectionAddNotification(n);
            const albumPurchaseCoverUrl =
              n.type === 'album_purchase' ? resolveAlbumPurchaseNotificationCoverUrl(n) : null;
            const albumPurchaseCover =
              n.type === 'album_purchase' && (albumPurchaseCoverUrl || n.albumTitle);
            const rowClassName = clsx(
              'user-notification-list__row',
              n.isRead && 'user-notification-list__row--read',
              staticListenerCollectionAdd && 'user-notification-list__row--static'
            );
            const rowContent = (
              <>
                <span
                  className={clsx(
                    'user-notification-list__row-icon',
                    (collectionActor || albumPurchaseCover) &&
                      'user-notification-list__row-icon--avatar'
                  )}
                  aria-hidden
                >
                  {albumPurchaseCover ? (
                    <AlbumCommentAvatar
                      imageUrl={albumPurchaseCoverUrl}
                      displayName={n.albumTitle ?? ''}
                      className="user-notification-list__row-actor-avatar"
                    />
                  ) : collectionActor ? (
                    <AlbumCommentAvatar
                      avatarPath={n.actorAvatarPath}
                      displayName={n.actorDisplayName ?? ''}
                      className="user-notification-list__row-actor-avatar"
                    />
                  ) : n.type === 'collection_add' ? (
                    <HeartHandshakeIcon size={18} strokeWidth={2} />
                  ) : n.type === 'comment_like' ? (
                    <HeartIcon size={18} strokeWidth={2} />
                  ) : n.type === 'comment_reply' ? (
                    <CornerUpLeftIcon size={18} strokeWidth={2} />
                  ) : n.type === 'album_purchase' ? (
                    <ShoppingBagIcon size={18} strokeWidth={2} />
                  ) : (
                    <MessageCircleIcon size={18} strokeWidth={2} />
                  )}
                </span>
                <span className="user-notification-list__row-main">
                  <span className="user-notification-list__row-title">
                    {notificationRowTitle(n, copy)}
                  </span>
                  <span className="user-notification-list__row-body">
                    {notificationRowBody(n, copy)}
                  </span>
                </span>
                <span className="user-notification-list__row-meta">
                  <time dateTime={n.createdAt}>
                    {formatNotificationRelativeTime(n.createdAt, lang)}
                  </time>
                  {!n.isRead ? (
                    <span className="user-notification-list__row-dot" aria-hidden />
                  ) : null}
                </span>
              </>
            );

            return (
              <li key={n.id}>
                {staticListenerCollectionAdd ? (
                  <div className={rowClassName}>{rowContent}</div>
                ) : (
                  <button type="button" className={rowClassName} onClick={() => onItemClick(n)}>
                    {rowContent}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {footer ? <div className="user-notification-list__footer">{footer}</div> : null}
    </>
  );
}
