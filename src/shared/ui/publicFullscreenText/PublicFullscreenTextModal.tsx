import { useId, type ReactNode } from 'react';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import '@features/albumComments/ui/albumComments.scss';
import './publicFullscreenTextModal.scss';

export type PublicFullscreenTextModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  closeAriaLabel?: string;
  children: ReactNode;
};

/**
 * Fullscreen text reader — same Popup shell as {@link AlbumCommentsModal}
 * (`.album-comments-fullscreen` + `publicBackdrop`).
 */
export function PublicFullscreenTextModal({
  isOpen,
  onClose,
  title,
  closeAriaLabel = 'Close',
  children,
}: PublicFullscreenTextModalProps) {
  const titleId = useId();

  return (
    <Popup isActive={isOpen} onClose={onClose} publicBackdrop aria-labelledby={titleId}>
      <div className="album-comments-fullscreen public-fullscreen-text">
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
            aria-label={closeAriaLabel}
          >
            <ModalCloseIcon />
          </PopupCloseButton>
        </header>

        <div className="album-comments-fullscreen__body">
          <div className="album-comments-fullscreen__column public-fullscreen-text__body">
            {children}
          </div>
        </div>
      </div>
    </Popup>
  );
}
