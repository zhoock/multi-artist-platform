import { useCallback } from 'react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { DashboardButton } from '@shared/ui/dashboard';
import { SubscriberContentLockIcon } from '@shared/ui/icons/SubscriberContentLockIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { Popup } from '@shared/ui/popup';

import '@shared/lib/archiveAccessModal/archiveAccessModal.style.scss';
import './collectionFullModal.scss';

export type CollectionFullModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpgradePlan: () => void;
  onManageCollection: () => void;
};

export function CollectionFullModal({
  isOpen,
  onClose,
  onUpgradePlan,
  onManageCollection,
}: CollectionFullModalProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const title =
    ui?.titles?.artistArchiveFullTitle ??
    (lang === 'en' ? 'Collection full' : 'Коллекция заполнена');
  const message =
    ui?.titles?.artistArchiveFullMessage ??
    (lang === 'en'
      ? 'All collection slots are occupied. To add this artist, remove an artist from your collection or upgrade your plan to unlock more slots.'
      : 'Все слоты коллекции заняты. Чтобы добавить этого артиста, удалите артиста из коллекции или смените тариф, чтобы получить больше слотов.');
  const upgradeLabel =
    ui?.buttons?.artistArchiveFullUpgradePlan ??
    ui?.header?.avatarMenu?.upgradePlan ??
    (lang === 'en' ? 'Upgrade plan' : 'Сменить тариф');
  const manageLabel =
    ui?.buttons?.artistArchiveFullManageCollection ??
    (lang === 'en' ? 'Manage collection' : 'Управлять коллекцией');
  const closeLabel = ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');

  const handleUpgradePlan = useCallback(() => {
    onClose();
    onUpgradePlan();
  }, [onClose, onUpgradePlan]);

  const handleManageCollection = useCallback(() => {
    onClose();
    onManageCollection();
  }, [onClose, onManageCollection]);

  return (
    <Popup
      isActive={isOpen}
      onClose={onClose}
      publicBackdrop
      aria-labelledby="collection-full-modal-title"
    >
      <div className="collection-full-modal" onClick={(event) => event.stopPropagation()}>
        <div
          className="collection-full-modal__card add-artist-to-archive-modal__card"
          role="document"
        >
          <header className="collection-full-modal__header">
            <button
              type="button"
              className="add-artist-to-archive-modal__close"
              aria-label={closeLabel}
              onClick={onClose}
            >
              <ModalCloseIcon />
            </button>
          </header>

          <div className="collection-full-modal__icon-wrap" aria-hidden>
            <SubscriberContentLockIcon className="collection-full-modal__icon" size={26} />
          </div>

          <h2 id="collection-full-modal-title" className="collection-full-modal__title">
            {title}
          </h2>

          <p className="collection-full-modal__message">{message}</p>

          <div className="collection-full-modal__actions">
            <DashboardButton
              type="button"
              variant="primary"
              className="collection-full-modal__action"
              onClick={handleUpgradePlan}
            >
              {upgradeLabel}
            </DashboardButton>
            <DashboardButton
              type="button"
              variant="outline"
              className="collection-full-modal__action"
              onClick={handleManageCollection}
            >
              {manageLabel}
            </DashboardButton>
            <button type="button" className="collection-full-modal__close-action" onClick={onClose}>
              {closeLabel}
            </button>
          </div>
        </div>
      </div>
    </Popup>
  );
}
