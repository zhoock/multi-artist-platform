import clsx from 'clsx';
import {
  Heart as HeartIcon,
  HeartHandshake as HeartHandshakeIcon,
  MessageCircle as MessageCircleIcon,
} from 'lucide-react';
import { formatNotificationRelativeTime } from '@shared/lib/formatNotificationRelativeTime';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import { profileAvatarPathToDisplayUrl } from '@shared/lib/profileAvatar';
import { isCollectionAddPublicActor } from '../lib/collectionAddNotification';
import {
  notificationRowBody,
  notificationRowTitle,
  type UserNotificationRowCopy,
} from '../lib/notificationRowCopy';
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
            const actorAvatarUrl = collectionActor
              ? profileAvatarPathToDisplayUrl(n.actorAvatarPath)
              : '';
            const actorInitial =
              collectionActor && n.actorDisplayName
                ? n.actorDisplayName.trim().slice(0, 1).toUpperCase()
                : '';

            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={clsx(
                    'user-notification-list__row',
                    n.isRead && 'user-notification-list__row--read'
                  )}
                  onClick={() => onItemClick(n)}
                >
                  <span
                    className={clsx(
                      'user-notification-list__row-icon',
                      collectionActor && 'user-notification-list__row-icon--avatar'
                    )}
                    aria-hidden
                  >
                    {collectionActor ? (
                      actorAvatarUrl ? (
                        <img src={actorAvatarUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="user-notification-list__row-icon-initial">
                          {actorInitial}
                        </span>
                      )
                    ) : n.type === 'collection_add' ? (
                      <HeartHandshakeIcon size={18} strokeWidth={2} />
                    ) : n.type === 'comment_like' ? (
                      <HeartIcon size={18} strokeWidth={2} />
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
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {footer ? <div className="user-notification-list__footer">{footer}</div> : null}
    </>
  );
}
