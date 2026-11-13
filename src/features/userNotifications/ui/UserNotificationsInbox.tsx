import { useCallback, useEffect, useState } from 'react';
import { isAuthenticated } from '@shared/lib/auth';
import {
  fetchUserNotifications,
  type UserNotificationItem,
} from '@shared/lib/userNotificationsApi';
import { USER_NOTIFICATIONS_PAGE_LIMIT } from '../lib/constants';
import { useUserNotificationsLiveRefresh } from '../lib/useUserNotificationsLiveRefresh';
import type { UserNotificationRowCopy } from '../lib/notificationRowCopy';
import type { RouteLang } from '@shared/lib/i18n/routeLang';
import { UserNotificationList } from './UserNotificationList';

type UserNotificationsInboxProps = {
  lang: RouteLang;
  rowCopy: UserNotificationRowCopy;
  emptyLabel: string;
  loadMoreLabel: string;
  loadErrorLabel: string;
  onItemClick: (item: UserNotificationItem) => void;
  /** When false, skips fetch/poll (e.g. modal closed). */
  enabled?: boolean;
};

export function UserNotificationsInbox({
  lang,
  rowCopy,
  emptyLabel,
  loadMoreLabel,
  loadErrorLabel,
  onItemClick,
  enabled = true,
}: UserNotificationsInboxProps) {
  const [items, setItems] = useState<UserNotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const loadPage = useCallback(
    async (cursor?: string | null, append = false, options?: { silent?: boolean }) => {
      if (!isAuthenticated()) return;
      const silent = options?.silent === true;
      if (!append && !silent) setLoading(true);
      else if (append) setLoadingMore(true);
      if (!silent) setError(false);
      try {
        const data = await fetchUserNotifications({
          limit: USER_NOTIFICATIONS_PAGE_LIMIT,
          cursor: cursor ?? undefined,
        });
        setItems((prev) => (append ? [...prev, ...data.notifications] : data.notifications));
        setNextCursor(data.nextCursor);
      } catch {
        if (!silent) {
          setError(true);
          if (!append) setItems([]);
        }
      } finally {
        if (!append && !silent) setLoading(false);
        else if (append) setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!enabled || !isAuthenticated()) return;
    void loadPage(null, false);
  }, [enabled, loadPage]);

  useUserNotificationsLiveRefresh({
    enabled: enabled && isAuthenticated(),
    onRefresh: () => loadPage(null, false, { silent: true }),
  });

  if (!enabled) return null;

  if (loading) {
    return null;
  }

  if (error) {
    return <p className="user-notification-list__empty">{loadErrorLabel}</p>;
  }

  return (
    <>
      <UserNotificationList
        items={items}
        lang={lang}
        copy={rowCopy}
        emptyLabel={items.length === 0 ? emptyLabel : undefined}
        onItemClick={(item) => {
          setItems((prev) =>
            prev.map((row) => (row.id === item.id ? { ...row, isRead: true } : row))
          );
          onItemClick(item);
        }}
      />
      {nextCursor ? (
        <button
          type="button"
          className="user-notifications-inbox__more"
          disabled={loadingMore}
          onClick={() => void loadPage(nextCursor, true)}
        >
          {loadMoreLabel}
        </button>
      ) : null}
    </>
  );
}
