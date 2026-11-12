import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { isAuthenticated } from '@shared/lib/auth';
import {
  fetchUserNotifications,
  type UserNotificationItem,
} from '@shared/lib/userNotificationsApi';
import {
  USER_NOTIFICATIONS_PAGE_LIMIT,
  useUserNotificationsLiveRefresh,
  UserNotificationList,
  useNotificationNavigation,
  type UserNotificationRowCopy,
} from '@features/userNotifications';
import { noindexRobotsMetaElement } from '@shared/lib/seo/noindexRobotsMeta';
import '@features/userNotifications/ui/userNotificationList.scss';
import './userNotificationsPage.scss';

export default function UserNotificationsPage() {
  const { lang } = useLang();
  const navigate = useNavigate();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.header?.notifications;
  const { openNotification } = useNotificationNavigation(lang);

  const [items, setItems] = useState<UserNotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const pageTitle = copy?.pageTitle ?? copy?.title ?? 'Notifications';
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
  const emptyLabel = copy?.pageEmpty ?? 'No notifications';
  const loadMoreLabel = copy?.loadMore ?? 'Show more';

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
    if (!isAuthenticated()) {
      const params = new URLSearchParams({ mode: 'login', returnTo: '/notifications' });
      navigate({ pathname: '/auth', search: `?${params.toString()}` });
      return;
    }
    void loadPage(null, false);
  }, [lang, loadPage, navigate]);

  useUserNotificationsLiveRefresh({
    enabled: isAuthenticated(),
    onRefresh: () => loadPage(null, false, { silent: true }),
  });

  const handleItemClick = (n: UserNotificationItem) => {
    void openNotification(n, {
      beforeNavigate: () => {
        setItems((prev) => prev.map((row) => (row.id === n.id ? { ...row, isRead: true } : row)));
      },
    });
  };

  return (
    <>
      <Helmet>{noindexRobotsMetaElement}</Helmet>
      <section
        className="user-notifications-page main-background"
        aria-labelledby="user-notifications-title"
      >
        <div className="wrapper user-notifications-page__wrapper">
          <h1 id="user-notifications-title" className="user-notifications-page__title">
            {pageTitle}
          </h1>
          {!loading && error ? (
            <p className="user-notification-list__empty">
              {copy?.loadError ?? 'Failed to load notifications.'}
            </p>
          ) : null}
          {!loading && !error ? (
            <>
              <UserNotificationList
                items={items}
                lang={lang}
                copy={listCopy}
                emptyLabel={items.length === 0 ? emptyLabel : undefined}
                onItemClick={handleItemClick}
              />
              {nextCursor ? (
                <button
                  type="button"
                  className="user-notifications-page__more"
                  disabled={loadingMore}
                  onClick={() => void loadPage(nextCursor, true)}
                >
                  {loadMoreLabel}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
