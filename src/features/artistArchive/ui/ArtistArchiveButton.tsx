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

export function ArtistArchiveButton({ artistUserId }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const dispatch = useAppDispatch();
  const publicArtistSlug = useAppSelector(selectPublicArtistSlug);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { open: openPremiumModal } = useArchiveAccessModal();

  const { buttonState, slotsRemaining, error, addToArchive, clearError } =
    useArtistArchiveStatus(artistUserId);

  const [archiveFullOpen, setArchiveFullOpen] = useState(false);

  const labelAdd =
    ui?.buttons?.artistArchiveAdd ?? (lang === 'en' ? 'Add to Archive' : 'Добавить в архив');
  const labelInArchive =
    ui?.buttons?.artistArchiveInArchive ?? (lang === 'en' ? 'In Archive' : 'В архиве');
  const labelFull =
    ui?.buttons?.artistArchiveFull ?? (lang === 'en' ? 'Archive Full' : 'Архив заполнен');
  const labelAdding =
    ui?.buttons?.artistArchiveAdding ?? (lang === 'en' ? 'Adding…' : 'Добавляем…');
  const slotsLeftLabel = (count: number) => {
    const template =
      ui?.titles?.artistArchiveSlotsLeft ??
      (lang === 'en' ? '{count} slot left' : '{count} слот остался');
    const templatePlural =
      ui?.titles?.artistArchiveSlotsLeftPlural ??
      (lang === 'en' ? '{count} slots left' : '{count} слота осталось');
    const text = count === 1 ? template : templatePlural;
    return text.replace('{count}', String(count));
  };
  const archiveFullTitle =
    ui?.titles?.artistArchiveFullTitle ?? (lang === 'en' ? 'Archive full' : 'Архив заполнен');
  const archiveFullMessage =
    ui?.titles?.artistArchiveFullMessage ??
    (lang === 'en'
      ? 'You have used all archive slots. Replacing an artist will be available later.'
      : 'Все слоты архива заняты. Замена артиста будет доступна позже.');

  const handleClick = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();

      if (buttonState === 'not_premium') {
        openPremiumModal({
          artistUserId: artistUserId ?? undefined,
          artistSlug: publicArtistSlug?.trim() || undefined,
        });
        return;
      }

      if (buttonState === 'archive_full') {
        setArchiveFullOpen(true);
        return;
      }

      if (buttonState !== 'can_add' || !artistUserId) return;

      try {
        await addToArchive();
        refreshPremiumContentForArchiveChange(dispatch, publicArtistSlug?.trim() ?? '');
        dispatchArchiveArtistAdded(artistUserId, publicArtistSlug?.trim() ?? undefined);
      } catch (err) {
        if (err instanceof ArchiveApiError && err.code === 'ARCHIVE_SLOTS_LIMIT') {
          setArchiveFullOpen(true);
        }
      }
    },
    [addToArchive, artistUserId, buttonState, dispatch, openPremiumModal, publicArtistSlug]
  );

  if (!artistUserId) {
    return <ArchiveButtonLayoutPlaceholder label={labelAdd} />;
  }

  if (buttonState === 'hidden') {
    return null;
  }

  const isDisabled =
    buttonState === 'loading' || buttonState === 'adding' || buttonState === 'in_archive';

  const buttonLabel =
    buttonState === 'loading'
      ? '…'
      : buttonState === 'adding'
        ? labelAdding
        : buttonState === 'in_archive'
          ? labelInArchive
          : buttonState === 'archive_full'
            ? labelFull
            : labelAdd;

  const showSlotsHint =
    buttonState === 'can_add' || buttonState === 'in_archive' || buttonState === 'adding';

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
          aria-busy={buttonState === 'loading' || buttonState === 'adding'}
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
          {buttonState === 'in_archive' ? (
            <span className="artist-archive-button__check" aria-hidden>
              <CheckIcon {...dashboardActionIconProps({ size: 14 })} />
            </span>
          ) : null}
          <span>{buttonLabel}</span>
        </button>

        {showSlotsHint && slotsRemaining > 0 ? (
          <span className="artist-archive-button__slots">{slotsLeftLabel(slotsRemaining)}</span>
        ) : null}

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
