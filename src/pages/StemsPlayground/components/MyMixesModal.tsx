// src/pages/StemsPlayground/components/MyMixesModal.tsx
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import type { SavedMix } from '@entities/savedMix';
import './MyMixesModal.style.scss';

export type MyMixesModalLabels = {
  title: string;
  empty: string;
  loading: string;
  apply: string;
  delete: string;
  copyLink: string;
  close: string;
};

type MyMixesModalProps = {
  isOpen: boolean;
  mixes: SavedMix[];
  loading: boolean;
  /** id микса, по которому идёт операция (delete/apply); блокирует его действия. */
  busyId: string | null;
  locale: string;
  labels: MyMixesModalLabels;
  onClose: () => void;
  onApply: (mix: SavedMix) => void;
  onDelete: (mix: SavedMix) => void;
  onCopyLink: (mix: SavedMix) => void;
};

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Список сохранённых миксов с действиями Apply / Delete / Copy Link. */
export function MyMixesModal({
  isOpen,
  mixes,
  loading,
  busyId,
  locale,
  labels,
  onClose,
  onApply,
  onDelete,
  onCopyLink,
}: MyMixesModalProps) {
  return (
    <Popup isActive={isOpen} onClose={onClose} publicBackdrop>
      <div className="my-mixes-modal">
        <div className="my-mixes-modal__card">
          <div className="my-mixes-modal__header">
            <h2 className="my-mixes-modal__title">{labels.title}</h2>
            <PopupCloseButton className="my-mixes-modal__close" aria-label={labels.close}>
              <ModalCloseIcon />
            </PopupCloseButton>
          </div>

          <div className="my-mixes-modal__body">
            {loading ? (
              <p className="my-mixes-modal__empty">{labels.loading}</p>
            ) : mixes.length === 0 ? (
              <p className="my-mixes-modal__empty">{labels.empty}</p>
            ) : (
              <ul className="my-mixes-modal__list">
                {mixes.map((mix) => {
                  const subtitle = [mix.trackTitle, mix.albumTitle].filter(Boolean).join(' • ');
                  const busy = busyId === mix.id;
                  return (
                    <li key={mix.id} className="my-mixes-modal__item">
                      <div className="my-mixes-modal__info">
                        <p className="my-mixes-modal__name">{mix.name}</p>
                        {subtitle ? <p className="my-mixes-modal__meta">{subtitle}</p> : null}
                        <p className="my-mixes-modal__date">{formatDate(mix.createdAt, locale)}</p>
                      </div>
                      <div className="my-mixes-modal__actions">
                        <button
                          type="button"
                          className="my-mixes-modal__button my-mixes-modal__button--primary"
                          onClick={() => onApply(mix)}
                          disabled={busy}
                        >
                          {labels.apply}
                        </button>
                        <button
                          type="button"
                          className="my-mixes-modal__button my-mixes-modal__button--secondary"
                          onClick={() => onCopyLink(mix)}
                          disabled={busy}
                        >
                          {labels.copyLink}
                        </button>
                        <button
                          type="button"
                          className="my-mixes-modal__button my-mixes-modal__button--destructive"
                          onClick={() => onDelete(mix)}
                          disabled={busy}
                        >
                          {labels.delete}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Popup>
  );
}
