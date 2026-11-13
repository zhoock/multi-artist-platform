import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { isAuthenticated } from '@shared/lib/auth';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import {
  headerNotificationsToRowCopy,
  UserNotificationsInbox,
  useNotificationNavigation,
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

  const pageTitle = copy?.pageTitle ?? copy?.title ?? 'Notifications';
  const rowCopy = headerNotificationsToRowCopy(copy);
  const emptyLabel = copy?.pageEmpty ?? 'No notifications';
  const loadMoreLabel = copy?.loadMore ?? 'Show more';
  const loadErrorLabel = copy?.loadError ?? 'Failed to load notifications.';

  useEffect(() => {
    if (!isAuthenticated()) {
      const params = new URLSearchParams({ mode: 'login', returnTo: '/notifications' });
      navigate({ pathname: '/auth', search: `?${params.toString()}` });
    }
  }, [navigate]);

  const handleItemClick = (n: UserNotificationItem) => {
    void openNotification(n);
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
          {isAuthenticated() ? (
            <UserNotificationsInbox
              lang={lang}
              rowCopy={rowCopy}
              emptyLabel={emptyLabel}
              loadMoreLabel={loadMoreLabel}
              loadErrorLabel={loadErrorLabel}
              onItemClick={handleItemClick}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}
