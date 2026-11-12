import clsx from 'clsx';
import { MessageCircle as MessageCircleIcon } from 'lucide-react';
import { formatNotificationRelativeTime } from '@shared/lib/formatNotificationRelativeTime';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import { formatAlbumNotificationBody } from '../lib/formatAlbumNotificationBody';
import './userNotificationList.scss';

type UserNotificationListProps = {
  items: UserNotificationItem[];
  lang: string;
  rowTitle: string;
  bodyTemplate: string;
  emptyLabel?: string;
  onItemClick: (item: UserNotificationItem) => void;
  footer?: React.ReactNode;
};

export function UserNotificationList({
  items,
  lang,
  rowTitle,
  bodyTemplate,
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
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={clsx(
                  'user-notification-list__row',
                  n.isRead && 'user-notification-list__row--read'
                )}
                onClick={() => onItemClick(n)}
              >
                <span className="user-notification-list__row-icon" aria-hidden>
                  <MessageCircleIcon size={18} strokeWidth={2} />
                </span>
                <span className="user-notification-list__row-main">
                  <span className="user-notification-list__row-title">{rowTitle}</span>
                  <span className="user-notification-list__row-body">
                    {formatAlbumNotificationBody(n, bodyTemplate)}
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
          ))}
        </ul>
      ) : null}
      {footer ? <div className="user-notification-list__footer">{footer}</div> : null}
    </>
  );
}
