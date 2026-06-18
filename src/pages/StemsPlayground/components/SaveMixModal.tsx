// src/pages/StemsPlayground/components/SaveMixModal.tsx
import { useEffect, useState } from 'react';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import './SaveMixModal.style.scss';

export type SaveMixModalLabels = {
  title: string;
  nameLabel: string;
  namePlaceholder: string;
  save: string;
  saving: string;
  close: string;
};

type SaveMixModalProps = {
  isOpen: boolean;
  busy: boolean;
  labels: SaveMixModalLabels;
  onClose: () => void;
  onSave: (name: string) => void;
};

/** Модалка сохранения микса: необязательное имя + Save. */
export function SaveMixModal({ isOpen, busy, labels, onClose, onSave }: SaveMixModalProps) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!isOpen) setName('');
  }, [isOpen]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    onSave(name);
  };

  return (
    <Popup isActive={isOpen} onClose={onClose} publicBackdrop closeBlocked={busy}>
      <div className="save-mix-modal">
        <form className="save-mix-modal__card" onSubmit={handleSubmit} aria-busy={busy}>
          <div className="save-mix-modal__header">
            <h2 className="save-mix-modal__title">{labels.title}</h2>
            <PopupCloseButton
              className="save-mix-modal__close"
              disabled={busy}
              aria-label={labels.close}
            >
              <ModalCloseIcon />
            </PopupCloseButton>
          </div>

          <div className="save-mix-modal__body">
            <div className="save-mix-modal__field">
              <label className="save-mix-modal__label" htmlFor="save-mix-name">
                {labels.nameLabel}
              </label>
              <input
                id="save-mix-name"
                type="text"
                className="save-mix-modal__input"
                value={name}
                placeholder={labels.namePlaceholder}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="save-mix-modal__actions">
            <button
              type="submit"
              className="save-mix-modal__button save-mix-modal__button--primary"
              disabled={busy}
            >
              {busy ? labels.saving : labels.save}
            </button>
          </div>
        </form>
      </div>
    </Popup>
  );
}
