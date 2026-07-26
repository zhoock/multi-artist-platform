// src/pages/StemsPlayground/components/MyMixesModal.tsx
import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle as AlertCircleIcon,
  Link as LinkIcon,
  Play as PlayIcon,
  Trash2 as TrashIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  DashboardButton,
  DashboardCard,
  DashboardLoadingState,
  DashboardSpinner,
} from '@shared/ui/dashboard';
import type { SavedMix } from '@entities/savedMix';
import './MyMixesModal.style.scss';

export type MyMixesModalLabels = {
  title: string;
  empty: string;
  apply: string;
  delete: string;
  cancel: string;
  copyLink: string;
  close: string;
  deleteConfirm: string;
  deleteDescription: string;
  deleteIrreversible: string;
};

type MyMixesModalProps = {
  isOpen: boolean;
  mixes: SavedMix[];
  loading: boolean;
  /** id микса, по которому идёт delete; блокирует подтверждение и показывает spinner. */
  deletingId: string | null;
  locale: string;
  labels: MyMixesModalLabels;
  onClose: () => void;
  onApply: (mix: SavedMix) => void;
  onDeleteConfirm: (mix: SavedMix) => Promise<void>;
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

function formatDeleteDescription(template: string, mixName: string): string {
  return template.replace('{name}', mixName);
}

/** Список сохранённых миксов с действиями Apply / Delete / Copy Link. */
export function MyMixesModal({
  isOpen,
  mixes,
  loading,
  deletingId,
  locale,
  labels,
  onClose,
  onApply,
  onDeleteConfirm,
  onCopyLink,
}: MyMixesModalProps) {
  const [confirmingMixId, setConfirmingMixId] = useState<string | null>(null);
  const cancelConfirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setConfirmingMixId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (confirmingMixId && !mixes.some((mix) => mix.id === confirmingMixId)) {
      setConfirmingMixId(null);
    }
  }, [mixes, confirmingMixId]);

  useEffect(() => {
    if (confirmingMixId) {
      cancelConfirmRef.current?.focus();
    }
  }, [confirmingMixId]);

  const handleCancelRequest = () => {
    if (confirmingMixId && !deletingId) {
      setConfirmingMixId(null);
      return;
    }
    onClose();
  };

  const handleCancelConfirm = () => {
    if (deletingId) return;
    setConfirmingMixId(null);
  };

  const handleConfirmDelete = async (mix: SavedMix) => {
    try {
      await onDeleteConfirm(mix);
      setConfirmingMixId(null);
    } catch {
      setConfirmingMixId(null);
    }
  };

  return (
    <Popup isActive={isOpen} onClose={onClose} onCancelRequest={handleCancelRequest} publicBackdrop>
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
              <DashboardLoadingState className="my-mixes-modal__loading" />
            ) : mixes.length === 0 ? (
              <p className="my-mixes-modal__empty">{labels.empty}</p>
            ) : (
              <ul className="my-mixes-modal__list">
                {mixes.map((mix) => {
                  const isConfirming = confirmingMixId === mix.id;
                  const isDeleting = deletingId === mix.id;

                  return (
                    <li key={mix.id} className="my-mixes-modal__list-item">
                      <DashboardCard
                        as="article"
                        className={clsx(
                          'my-mixes-modal__mix-card',
                          isConfirming && 'my-mixes-modal__mix-card--confirm'
                        )}
                      >
                        <div className="my-mixes-modal__item-header">
                          <div className="my-mixes-modal__info">
                            <p className="my-mixes-modal__name">{mix.name}</p>
                            <p className="my-mixes-modal__date">
                              {formatDate(mix.createdAt, locale)}
                            </p>
                          </div>

                          {!isConfirming ? (
                            <div className="my-mixes-modal__actions">
                              <DashboardButton
                                variant="icon"
                                className="my-mixes-modal__icon-button my-mixes-modal__icon-button--apply"
                                onClick={() => onApply(mix)}
                                aria-label={labels.apply}
                                title={labels.apply}
                              >
                                <PlayIcon {...dashboardActionIconProps()} />
                              </DashboardButton>
                              <DashboardButton
                                variant="icon"
                                className="my-mixes-modal__icon-button"
                                onClick={() => onCopyLink(mix)}
                                aria-label={labels.copyLink}
                                title={labels.copyLink}
                              >
                                <LinkIcon {...dashboardActionIconProps()} />
                              </DashboardButton>
                              <DashboardButton
                                variant="icon"
                                destructive
                                className="my-mixes-modal__icon-button"
                                onClick={() => setConfirmingMixId(mix.id)}
                                aria-label={labels.delete}
                                title={labels.delete}
                              >
                                <TrashIcon {...dashboardActionIconProps()} />
                              </DashboardButton>
                            </div>
                          ) : null}
                        </div>

                        {isConfirming ? (
                          <div className="my-mixes-modal__confirm">
                            <div
                              className="my-mixes-modal__confirm-panel"
                              role="group"
                              aria-live="polite"
                              aria-label={labels.deleteConfirm}
                            >
                              <div className="my-mixes-modal__confirm-alert">
                                <span className="my-mixes-modal__confirm-icon" aria-hidden="true">
                                  <AlertCircleIcon
                                    {...dashboardActionIconProps({ size: 20, strokeWidth: 1.75 })}
                                  />
                                </span>
                                <div className="my-mixes-modal__confirm-copy">
                                  <p className="my-mixes-modal__confirm-title">
                                    {labels.deleteConfirm}
                                  </p>
                                  <p className="my-mixes-modal__confirm-message">
                                    {formatDeleteDescription(labels.deleteDescription, mix.name)}{' '}
                                    {labels.deleteIrreversible}
                                  </p>
                                </div>
                              </div>

                              <div className="my-mixes-modal__confirm-actions">
                                <button
                                  ref={cancelConfirmRef}
                                  type="button"
                                  className="my-mixes-modal__button my-mixes-modal__button--secondary"
                                  onClick={handleCancelConfirm}
                                  disabled={isDeleting}
                                >
                                  {labels.cancel}
                                </button>
                                <button
                                  type="button"
                                  className="my-mixes-modal__button my-mixes-modal__button--destructive my-mixes-modal__button--loading"
                                  onClick={() => void handleConfirmDelete(mix)}
                                  disabled={isDeleting}
                                  aria-busy={isDeleting}
                                >
                                  {isDeleting ? (
                                    <DashboardSpinner className="my-mixes-modal__button-spinner" />
                                  ) : null}
                                  {labels.delete}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </DashboardCard>
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
