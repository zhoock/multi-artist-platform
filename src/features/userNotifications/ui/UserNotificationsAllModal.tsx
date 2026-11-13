import { useCallback, useId } from 'react';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import type { UserNotificationItem } from '@shared/lib/userNotificationsApi';
import type { RouteLang } from '@shared/lib/i18n/routeLang';
import { headerNotificationsToRowCopy } from '../lib/notificationRowCopy';
import { useNotificationNavigation } from '../lib/useNotificationNavigation';
import { UserNotificationsInbox } from './UserNotificationsInbox';
import '@features/albumComments/ui/albumComments.scss';
import './userNotificationList.scss';

type UserNotificationsAllModalProps = {
  isOpen: boolean;
  onClose: () => void;
  lang: RouteLang;
  notificationsCopy?: {
    title?: string;
    pageTitle?: string;
    pageEmpty?: string;
    empty?: string;
    loadMore?: string;
    loadError?: string;
    close?: string;
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
  } | null;
  onUnreadCount?: (count: number) => void;
};

/**
 * Full notifications list — same public fullscreen Popup shell as {@link AlbumCommentsModal}
 * (`.album-comments-fullscreen` + `publicBackdrop`).
 */
export function UserNotificationsAllModal({
  isOpen,
  onClose,
  lang,
  notificationsCopy,
  onUnreadCount,
}: UserNotificationsAllModalProps) {
  const titleId = useId();
  const { openNotification } = useNotificationNavigation(lang);

  const title = notificationsCopy?.pageTitle ?? notificationsCopy?.title ?? 'Notifications';
  const emptyLabel = notificationsCopy?.pageEmpty ?? notificationsCopy?.empty ?? 'No notifications';
  const loadMoreLabel = notificationsCopy?.loadMore ?? 'Show more';
  const loadErrorLabel = notificationsCopy?.loadError ?? 'Failed to load notifications.';
  const closeLabel = notificationsCopy?.close ?? 'Close';
  const rowCopy = headerNotificationsToRowCopy(notificationsCopy);

  const handleItemClick = useCallback(
    (n: UserNotificationItem) => {
      void openNotification(n, {
        onUnreadCount,
        beforeNavigate: () => onClose(),
      });
    },
    [onClose, onUnreadCount, openNotification]
  );

  return (
    <Popup isActive={isOpen} onClose={onClose} publicBackdrop aria-labelledby={titleId}>
      <div className="album-comments-fullscreen">
        <header className="album-comments-fullscreen__header">
          <div className="album-comments-fullscreen__header-main">
            <div className="album-comments-fullscreen__column">
              <h2 id={titleId} className="album-comments-fullscreen__title">
                {title}
              </h2>
            </div>
          </div>
          <PopupCloseButton
            type="button"
            className="album-comments-fullscreen__close"
            aria-label={closeLabel}
          >
            <ModalCloseIcon />
          </PopupCloseButton>
        </header>

        <div className="album-comments-fullscreen__body">
          <div className="album-comments-fullscreen__column">
            <UserNotificationsInbox
              enabled={isOpen}
              lang={lang}
              rowCopy={rowCopy}
              emptyLabel={emptyLabel}
              loadMoreLabel={loadMoreLabel}
              loadErrorLabel={loadErrorLabel}
              onItemClick={handleItemClick}
            />
          </div>
        </div>
      </div>
    </Popup>
  );
}
