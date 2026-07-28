/**
 * Кастомный компонент для уведомлений
 * Заменяет системные window.alert()
 */

import clsx from 'clsx';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { Popup, PopupCloseButton } from '../popup';
import './style.scss';

export interface AlertModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  buttonText?: string;
  /** aria-label для кнопки «×». */
  closeLabel?: string;
  /** × / Escape — только закрытие. */
  onClose: () => void;
  /** Основная кнопка (OK). Если не задана — вызывается `onClose`. */
  onAction?: () => void;
  /** Дополнительная кнопка (например, «Повторить»). Не закрывает модалку автоматически. */
  secondaryButton?: {
    text: string;
    onClick: () => void;
    disabled?: boolean;
  };
  variant?: 'success' | 'error' | 'warning' | 'info';
}

export function AlertModal({
  isOpen,
  title,
  message,
  buttonText = 'OK',
  closeLabel = 'Close',
  onClose,
  onAction,
  secondaryButton,
  variant = 'info',
}: AlertModalProps) {
  const isDestructive = variant === 'error';

  const handleAction = () => {
    if (onAction) {
      onAction();
    }
    onClose();
  };

  return (
    <Popup isActive={isOpen} onClose={onClose} publicBackdrop>
      <div className="alert-modal" onClick={(event) => event.stopPropagation()}>
        <div className="alert-modal__card">
          <header className="alert-modal__header">
            {title ? <h2 className="alert-modal__title">{title}</h2> : null}
            <PopupCloseButton type="button" className="alert-modal__close" aria-label={closeLabel}>
              <ModalCloseIcon />
            </PopupCloseButton>
          </header>

          <p className="alert-modal__message">{message}</p>

          <footer className="alert-modal__footer">
            {secondaryButton ? (
              <button
                type="button"
                className={clsx(
                  'alert-modal__button',
                  'alert-modal__button--secondary',
                  'dashboard-button',
                  'dashboard-button--outline'
                )}
                disabled={secondaryButton.disabled}
                onClick={secondaryButton.onClick}
              >
                {secondaryButton.text}
              </button>
            ) : null}
            <button
              type="button"
              className={clsx(
                'alert-modal__button',
                'dashboard-button',
                isDestructive ? 'dashboard-button--destructive' : 'dashboard-button--primary'
              )}
              onClick={handleAction}
            >
              {buttonText}
            </button>
          </footer>
        </div>
      </div>
    </Popup>
  );
}
