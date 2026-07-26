import { useCallback, useState, type RefObject } from 'react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { ArchiveApiError } from '@shared/api/archive';
import { LocalModal } from '@shared/ui/localModal';
import { DashboardButton } from '@shared/ui/dashboard';
import { useArtistPageBuilderNav } from '@shared/ui/artistPageBuilder/useArtistPageBuilderNav';
import { ArtistArchiveLockIcon } from '@shared/ui/icons/ArtistArchiveLockIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { dispatchArchiveArtistAdded } from '@features/artistArchive';
import { CollectionFullModal } from '@features/artistArchive/ui/CollectionFullModal';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { useArtistArchiveStatus } from '@features/artistArchive/lib/useArtistArchiveStatus';

import { ArchiveAccessModalFeatures } from './ArchiveAccessModalFeatures';
import type { PendingPremiumContentAccess } from './archiveAccessModalContext';

import './archiveAccessModal.style.scss';

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  pendingAccess: PendingPremiumContentAccess | null;
  onClose: () => void;
};

export function AddArtistToArchiveModalView({ dialogRef, pendingAccess, onClose }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { open: openPremiumModal } = useArchiveAccessModal();
  const { openDashboard } = useArtistPageBuilderNav();

  const artistUserId = pendingAccess?.artistUserId ?? null;
  const artistSlug = pendingAccess?.artistSlug?.trim() || null;
  const { displayLabel: artistName } = useSiteArtistDisplayName(lang, { artistSlug });

  const { addToArchive } = useArtistArchiveStatus(artistUserId);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [archiveFullOpen, setArchiveFullOpen] = useState(false);

  const title =
    ui?.titles?.addArtistToArchiveTitle ??
    (lang === 'en' ? 'Artist not in your collection' : 'Артист не в вашей коллекции');
  const descriptionTemplate =
    ui?.titles?.addArtistToArchiveDescription ??
    (lang === 'en'
      ? 'Add {artist} to your collection to unlock tracks, articles, stems and downloads.'
      : 'Добавьте {artist} в коллекцию, чтобы открыть треки, статьи, стемы и скачивание.');
  const descriptionFallback =
    ui?.titles?.addArtistToArchiveDescriptionGeneric ??
    (lang === 'en'
      ? 'Add this artist to your collection to unlock tracks, articles, stems and downloads.'
      : 'Добавьте артиста в коллекцию, чтобы открыть треки, статьи, стемы и скачивание.');
  const description = artistName.trim()
    ? descriptionTemplate.replace('{artist}', artistName.trim())
    : descriptionFallback;

  const addLabel =
    ui?.buttons?.artistArchiveAdd ?? (lang === 'en' ? 'Add to Collection' : 'Добавить в коллекцию');
  const addingLabel =
    ui?.buttons?.artistArchiveAdding ?? (lang === 'en' ? 'Adding…' : 'Добавляем…');
  const closeLabel = ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');

  const dismiss = useCallback(() => {
    setAddError(null);
    onClose();
  }, [onClose]);

  const handleAdd = useCallback(async () => {
    if (!artistUserId || adding) return;

    setAdding(true);
    setAddError(null);

    try {
      await addToArchive();
      dispatchArchiveArtistAdded(artistUserId, artistSlug ?? undefined);
      dismiss();
      await pendingAccess?.onAccessGranted?.();
    } catch (err) {
      if (err instanceof ArchiveApiError && err.code === 'ARCHIVE_SLOTS_LIMIT') {
        dismiss();
        setArchiveFullOpen(true);
        return;
      }
      setAddError(
        err instanceof Error
          ? err.message
          : lang === 'en'
            ? 'Could not add to collection'
            : 'Не удалось добавить в коллекцию'
      );
    } finally {
      setAdding(false);
    }
  }, [addToArchive, adding, artistSlug, artistUserId, dismiss, lang, pendingAccess]);

  const openUpgradeModal = useCallback(() => {
    openPremiumModal({
      artistUserId: artistUserId ?? undefined,
      artistSlug: artistSlug ?? undefined,
    });
  }, [artistSlug, artistUserId, openPremiumModal]);

  return (
    <>
      <LocalModal
        dialogRef={dialogRef}
        className="add-artist-to-archive-modal"
        aria-labelledby="add-artist-to-archive-modal-title"
        onClose={dismiss}
      >
        <div className="add-artist-to-archive-modal__card">
          <header className="add-artist-to-archive-modal__header">
            <div className="add-artist-to-archive-modal__heading">
              <ArtistArchiveLockIcon className="add-artist-to-archive-modal__icon" size={26} />
              <h2
                id="add-artist-to-archive-modal-title"
                className="add-artist-to-archive-modal__title"
              >
                {title}
              </h2>
            </div>
            <button
              type="button"
              className="add-artist-to-archive-modal__close"
              aria-label={closeLabel}
              onClick={dismiss}
            >
              <ModalCloseIcon />
            </button>
          </header>

          <p className="add-artist-to-archive-modal__description">{description}</p>

          <ArchiveAccessModalFeatures lang={lang} ui={ui} />

          <hr className="add-artist-to-archive-modal__divider" />

          <DashboardButton
            type="button"
            variant="primary"
            className="add-artist-to-archive-modal__cta"
            disabled={adding || !artistUserId}
            loading={adding}
            onClick={() => void handleAdd()}
          >
            {adding ? addingLabel : addLabel}
          </DashboardButton>

          {addError ? (
            <p className="add-artist-to-archive-modal__error" role="alert">
              {addError}
            </p>
          ) : null}
        </div>
      </LocalModal>

      <CollectionFullModal
        isOpen={archiveFullOpen}
        onClose={() => setArchiveFullOpen(false)}
        onUpgradePlan={openUpgradeModal}
        onManageCollection={() => openDashboard('collection')}
      />
    </>
  );
}
