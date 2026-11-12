import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell as BellIcon } from 'lucide-react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { isAuthenticated } from '@shared/lib/auth';
import {
  fetchUserNotifications,
  type UserNotificationItem,
} from '@shared/lib/userNotificationsApi';
import {
  USER_NOTIFICATIONS_DROPDOWN_LIMIT,
  USER_NOTIFICATIONS_LIVE_POLL_MS,
  USER_NOTIFICATIONS_UNREAD_POLL_MS,
  UserNotificationList,
  useNotificationNavigation,
  useUserNotificationsLiveRefresh,
  type UserNotificationRowCopy,
} from '@features/userNotifications';
import { markUnreadListenerCollectionAddsAsRead } from '@features/userNotifications/lib/markUnreadListenerCollectionAddsAsRead';
import './headerNotifications.scss';
import '@features/userNotifications/ui/userNotificationList.scss';

type HeaderNotificationsBellProps = {
  closeWhenSiblingMenuOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function HeaderNotificationsBellComponent({
  closeWhenSiblingMenuOpen = false,
  onOpenChange,
}: HeaderNotificationsBellProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.header?.notifications;
  const { openNotification } = useNotificationNavigation(lang);

  const titleId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);

  const updateOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const refresh = useCallback(
    async (options?: { silent?: boolean; autoMarkListenerCollectionAdds?: boolean }) => {
      if (!isAuthenticated()) return;
      if (!options?.silent) setLoading(true);
      try {
        const data = await fetchUserNotifications({ limit: USER_NOTIFICATIONS_DROPDOWN_LIMIT });
        let notifications = data.notifications;
        let unreadCount = data.unreadCount;

        if (options?.autoMarkListenerCollectionAdds) {
          const marked = await markUnreadListenerCollectionAddsAsRead(notifications);
          notifications = marked.notifications;
          if (marked.unreadCount !== null) {
            unreadCount = marked.unreadCount;
          }
        }

        setNotifications(notifications);
        setUnreadCount(unreadCount);
        setHasMoreNotifications(Boolean(data.nextCursor));
      } catch {
        if (!options?.silent) {
          setNotifications([]);
          setUnreadCount(0);
          setHasMoreNotifications(false);
        }
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isAuthenticated()) return;
    void refresh();
  }, [refresh]);

  useUserNotificationsLiveRefresh({
    enabled: isAuthenticated(),
    pollIntervalMs: open ? USER_NOTIFICATIONS_LIVE_POLL_MS : USER_NOTIFICATIONS_UNREAD_POLL_MS,
    onRefresh: () => refresh({ silent: true }),
  });

  useEffect(() => {
    if (closeWhenSiblingMenuOpen) updateOpen(false);
  }, [closeWhenSiblingMenuOpen, updateOpen]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current && !wrapRef.current.contains(t)) updateOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [updateOpen]);

  useEffect(() => {
    if (!open) return;
    void refresh({ autoMarkListenerCollectionAdds: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') updateOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, refresh, updateOpen]);

  const toggle = () => updateOpen(!open);

  const handleRowClick = (n: UserNotificationItem) => {
    void openNotification(n, {
      onUnreadCount: setUnreadCount,
      beforeNavigate: () => {
        setNotifications((prev) =>
          prev.map((row) => (row.id === n.id ? { ...row, isRead: true } : row))
        );
        updateOpen(false);
      },
    });
  };

  if (!isAuthenticated()) return null;

  const bellLabel = copy?.bellAriaLabel ?? 'Notifications';
  const panelTitle = copy?.title ?? 'Notifications';
  const emptyCopy = copy?.pageEmpty ?? copy?.empty ?? 'No notifications';
  const listCopy: UserNotificationRowCopy = {
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
  };
  const viewAllLabel = copy?.viewAll ?? 'View all notifications →';

  const showEmpty = !loading && notifications.length === 0;

  return (
    <div className="header__notifications-wrap" ref={wrapRef}>
      <button
        type="button"
        className="header__notifications-bell"
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={titleId}
        aria-label={bellLabel}
        title={bellLabel}
      >
        <BellIcon
          className="header__notifications-bell-icon"
          size={22}
          strokeWidth={2}
          aria-hidden
        />
        {unreadCount > 0 ? <span className="header__notifications-bell-dot" aria-hidden /> : null}
      </button>
      {open ? (
        <div
          id={titleId}
          className="header__notifications-panel"
          role="region"
          aria-label={panelTitle}
        >
          <p className="header__notifications-panel-title">{panelTitle}</p>
          {showEmpty ? <p className="header__notifications-empty">{emptyCopy}</p> : null}
          {notifications.length > 0 ? (
            <UserNotificationList
              items={notifications}
              lang={lang}
              copy={listCopy}
              onItemClick={handleRowClick}
              footer={
                hasMoreNotifications ? (
                  <Link
                    to="/notifications"
                    className="user-notification-list__view-all"
                    onClick={() => updateOpen(false)}
                  >
                    {viewAllLabel}
                  </Link>
                ) : undefined
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const HeaderNotificationsBell = memo(HeaderNotificationsBellComponent);
