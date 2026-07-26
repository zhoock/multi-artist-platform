import { useCallback, useState } from 'react';
import { Check as CheckIcon, Plus as PlusIcon } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { selectPublicArtistSlug } from '@shared/model/currentArtist';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { AlertModal } from '@shared/ui/alertModal';
import { SubscriberContentLockIcon } from '@shared/ui/icons/SubscriberContentLockIcon';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ArchiveApiError } from '@shared/api/archive';

import {
  dispatchArchiveArtistAdded,
  refreshPremiumContentForArchiveChange,
} from '../lib/refreshPremiumContent';
import { useArtistArchiveStatus } from '../lib/useArtistArchiveStatus';

import './style.scss';

type Props = {
  artistUserId: string | null;
  /**
   * Artist-side monetization gate. When false/undefined, the collection CTA is hidden
   * so it cannot appear on pages that forget to check payment connection.
   */
  monetizationEnabled?: boolean;
};

/** Invisible twin of the archive CTA — reserves space before artist meta loads. */
function ArchiveButtonLayoutPlaceholder({ label }: { label: string }) {
  return (
    <div className="artist-archive-button artist-archive-button--layout-placeholder" aria-hidden>
      <span className="artist-archive-button__btn">
        <SubscriberContentLockIcon className="artist-archive-button__lock-icon" size={14} />
        <span>{label}</span>
      </span>
    </div>
  );
}

export function ArtistArchiveButton({ artistUserId, monetizationEnabled = false }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const dispatch = useAppDispatch();
  const publicArtistSlug = useAppSelector(selectPublicArtistSlug);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { open: openPremiumModal } = useArchiveAccessModal();

  const { buttonState, error, addToArchive, activateInArchive, clearError } =
    useArtistArchiveStatus(monetizationEnabled ? artistUserId : null);

  const [archiveFullOpen, setArchiveFullOpen] = useState(false);

  const labelInCollection =
    ui?.buttons?.artistCollectionIn ??
    ui?.buttons?.artistArchiveInArchive ??
    (lang === 'en' ? 'In Collection' : 'В коллекции');
  const labelAdd =
    ui?.buttons?.artistArchiveAdd ?? (lang === 'en' ? 'Add to Collection' : 'Добавить в коллекцию');
  const labelFull =
    ui?.buttons?.artistArchiveFull ?? (lang === 'en' ? 'Collection Full' : 'Коллекция заполнена');
  const labelAdding =
    ui?.buttons?.artistArchiveAdding ?? (lang === 'en' ? 'Adding…' : 'Добавляем…');
  const renewLabel =
    ui?.buttons?.artistCollectionRenew ?? (lang === 'en' ? 'Renew Support' : 'Продлить поддержку');
  const activateLabel = lang === 'en' ? 'Activate' : 'Активировать';
  const labelActivating = lang === 'en' ? 'Activating…' : 'Активируем…';
  const archiveFullTitle =
    ui?.titles?.artistArchiveFullTitle ??
    (lang === 'en' ? 'Collection full' : 'Коллекция заполнена');
  const archiveFullMessage =
    ui?.titles?.artistArchiveFullMessage ??
    (lang === 'en'
      ? 'You have used all collection slots. Remove an artist when their lock expires to add another.'
      : 'Все слоты коллекции заняты. Удалите артиста после окончания блокировки, чтобы добавить другого.');

  const openRenewModal = useCallback(() => {
    openPremiumModal({
      artistUserId: artistUserId ?? undefined,
      artistSlug: publicArtistSlug?.trim() || undefined,
    });
  }, [artistUserId, openPremiumModal, publicArtistSlug]);

  const handleClick = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();

      if (buttonState === 'subscription_inactive' || buttonState === 'not_premium') {
        openRenewModal();
        return;
      }

      if (buttonState === 'in_collection_inactive') {
        if (!artistUserId) return;
        try {
          await activateInArchive();
          refreshPremiumContentForArchiveChange(dispatch, publicArtistSlug?.trim() ?? undefined);
        } catch (err) {
          if (
            err instanceof ArchiveApiError &&
            (err.code === 'ARCHIVE_SLOTS_LIMIT' || err.code === 'ARCHIVE_ACTIVATION_LIMIT')
          ) {
            setArchiveFullOpen(true);
          }
        }
        return;
      }

      if (buttonState === 'archive_full') {
        setArchiveFullOpen(true);
        return;
      }

      if (buttonState !== 'can_add' || !artistUserId) return;

      try {
        await addToArchive();
        dispatchArchiveArtistAdded(artistUserId, publicArtistSlug?.trim() ?? undefined);
      } catch (err) {
        if (err instanceof ArchiveApiError && err.code === 'ARCHIVE_SLOTS_LIMIT') {
          setArchiveFullOpen(true);
        }
      }
    },
    [
      activateInArchive,
      addToArchive,
      artistUserId,
      buttonState,
      dispatch,
      openRenewModal,
      publicArtistSlug,
    ]
  );

  if (!monetizationEnabled) {
    return null;
  }

  if (!artistUserId) {
    return <ArchiveButtonLayoutPlaceholder label={labelAdd} />;
  }

  if (buttonState === 'hidden') {
    return null;
  }

  const isDisabled =
    buttonState === 'loading' ||
    buttonState === 'adding' ||
    buttonState === 'activating' ||
    buttonState === 'in_collection_active';

  const buttonLabel =
    buttonState === 'loading'
      ? '…'
      : buttonState === 'adding'
        ? labelAdding
        : buttonState === 'activating'
          ? labelActivating
          : buttonState === 'subscription_inactive'
            ? renewLabel
            : buttonState === 'in_collection_inactive'
              ? activateLabel
              : buttonState === 'in_collection_active'
                ? labelInCollection
                : buttonState === 'archive_full'
                  ? labelFull
                  : labelAdd;

  return (
    <>
      <div
        className="artist-archive-button"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={`artist-archive-button__btn artist-archive-button__btn--${buttonState}`}
          disabled={isDisabled}
          aria-busy={
            buttonState === 'loading' || buttonState === 'adding' || buttonState === 'activating'
          }
          onClick={handleClick}
        >
          {buttonState === 'can_add' ? (
            <span className="artist-archive-button__plus" aria-hidden>
              <PlusIcon {...dashboardActionIconProps({ size: 14 })} />
            </span>
          ) : null}
          {buttonState === 'not_premium' || buttonState === 'archive_full' ? (
            <SubscriberContentLockIcon className="artist-archive-button__lock-icon" size={14} />
          ) : null}
          {buttonState === 'in_collection_active' ? (
            <span className="artist-archive-button__check" aria-hidden>
              <CheckIcon {...dashboardActionIconProps({ size: 14 })} />
            </span>
          ) : null}
          <span>{buttonLabel}</span>
        </button>

        {error ? (
          <button
            type="button"
            className="artist-archive-button__error"
            onClick={clearError}
            title={error}
          >
            !
          </button>
        ) : null}
      </div>

      <AlertModal
        isOpen={archiveFullOpen}
        title={archiveFullTitle}
        message={archiveFullMessage}
        variant="warning"
        onClose={() => setArchiveFullOpen(false)}
      />
    </>
  );
}
