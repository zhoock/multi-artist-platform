import { useCallback, useState, type RefObject } from 'react';
import { X as XIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { ArchiveApiError } from '@shared/api/archive';
import { AlertModal } from '@shared/ui/alertModal';
import { LocalModal } from '@shared/ui/localModal';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { dispatchArchiveArtistAdded, awaitPremiumContentRefresh } from '@features/artistArchive';
import { useArtistArchiveStatus } from '@features/artistArchive/lib/useArtistArchiveStatus';

import { ArchiveAccessModalFeatures } from './ArchiveAccessModalFeatures';
import type { PendingPremiumContentAccess } from './archiveAccessModalContext';

import './archiveAccessModal.scss';

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  pendingAccess: PendingPremiumContentAccess | null;
  onClose: () => void;
};

export function AddArtistToArchiveModalView({ dialogRef, pendingAccess, onClose }: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const artistUserId = pendingAccess?.artistUserId ?? null;
  const artistSlug = pendingAccess?.artistSlug?.trim() || null;
  const { displayLabel: artistName } = useSiteArtistDisplayName(lang, { artistSlug });

  const { addToArchive } = useArtistArchiveStatus(artistUserId);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [archiveFullOpen, setArchiveFullOpen] = useState(false);

  const title =
    ui?.titles?.addArtistToArchiveTitle ??
    (lang === 'en' ? 'This artist is not in your Archive' : 'Этого артиста нет в вашем архиве');
  const descriptionTemplate =
    ui?.titles?.addArtistToArchiveDescription ??
    (lang === 'en'
      ? 'Add {artist} to your Archive to unlock tracks, articles, stems and downloads.'
      : 'Добавьте {artist} в архив, чтобы открыть треки, статьи, стемы и скачивание.');
  const descriptionFallback =
    ui?.titles?.addArtistToArchiveDescriptionGeneric ??
    (lang === 'en'
      ? 'Add this artist to your Archive to unlock tracks, articles, stems and downloads.'
      : 'Добавьте артиста в архив, чтобы открыть треки, статьи, стемы и скачивание.');
  const description = artistName.trim()
    ? descriptionTemplate.replace('{artist}', artistName.trim())
    : descriptionFallback;

  const addLabel =
    ui?.buttons?.artistArchiveAdd ?? (lang === 'en' ? 'Add to Archive' : 'Добавить в архив');
  const addingLabel =
    ui?.buttons?.artistArchiveAdding ?? (lang === 'en' ? 'Adding…' : 'Добавляем…');
  const closeLabel = ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');
  const archiveFullTitle =
    ui?.titles?.artistArchiveFullTitle ?? (lang === 'en' ? 'Archive full' : 'Архив заполнен');
  const archiveFullMessage =
    ui?.titles?.artistArchiveFullMessage ??
    (lang === 'en'
      ? 'You have used all archive slots. Replacing an artist will be available later.'
      : 'Все слоты архива заняты. Замена артиста будет доступна позже.');
  const manageArchiveLabel =
    ui?.buttons?.premiumSuccessGoToArchive ?? (lang === 'en' ? 'Go to Archive' : 'Перейти в архив');

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
      await awaitPremiumContentRefresh(dispatch, artistSlug);
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
            ? 'Could not add to archive'
            : 'Не удалось добавить в архив'
      );
    } finally {
      setAdding(false);
    }
  }, [addToArchive, adding, artistSlug, artistUserId, dispatch, dismiss, lang, pendingAccess]);

  const handleGoToArchive = useCallback(() => {
    setArchiveFullOpen(false);
    navigate('/dashboard-new/archive');
  }, [navigate]);

  return (
    <>
      <LocalModal
        dialogRef={dialogRef}
        className="archive-access-modal archive-access-modal--add-artist"
        aria-labelledby="add-artist-to-archive-modal-title"
        onClose={dismiss}
      >
        <div className="archive-access-modal__panel">
          <button
            type="button"
            className="archive-access-modal__close"
            aria-label={closeLabel}
            onClick={dismiss}
          >
            <XIcon {...dashboardActionIconProps({ size: 18 })} />
          </button>

          <header className="archive-access-modal__header archive-access-modal__header--add-artist">
            <span className="archive-access-modal__header-cluster" aria-hidden>
              <span className="archive-access-modal__header-cluster-icon">♪</span>
              <span className="archive-access-modal__header-cluster-icon">⊕</span>
            </span>
            <h2 id="add-artist-to-archive-modal-title" className="archive-access-modal__title">
              {title}
            </h2>
          </header>

          <p className="archive-access-modal__description">{description}</p>

          <ArchiveAccessModalFeatures lang={lang} ui={ui} />

          <hr className="archive-access-modal__rule" />

          <button
            type="button"
            className="archive-access-modal__cta"
            disabled={adding || !artistUserId}
            aria-busy={adding}
            onClick={() => void handleAdd()}
          >
            {adding ? addingLabel : addLabel}
          </button>

          {addError ? (
            <p className="archive-access-modal__checkout-error" role="alert">
              {addError}
            </p>
          ) : null}
        </div>
      </LocalModal>

      <AlertModal
        isOpen={archiveFullOpen}
        title={archiveFullTitle}
        message={archiveFullMessage}
        buttonText={manageArchiveLabel}
        variant="warning"
        onClose={handleGoToArchive}
      />
    </>
  );
}
