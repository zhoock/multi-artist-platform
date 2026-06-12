/**
 * Кастомный компонент для уведомлений
 * Заменяет системные window.alert()
 */

import React from 'react';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { Popup } from '../popup';
import './style.scss';

export interface AlertModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  buttonText?: string;
  onClose: () => void;
  variant?: 'success' | 'error' | 'warning' | 'info';
}

export function AlertModal({
  isOpen,
  title,
  message,
  buttonText = 'OK',
  onClose,
  variant = 'info',
}: AlertModalProps) {
  return (
    <Popup isActive={isOpen} onClose={onClose}>
      <div className="alert-modal">
        <div className="alert-modal__card">
          <div className="alert-modal__header">
            <button
              type="button"
              className="alert-modal__close"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <ModalCloseIcon />
            </button>
            {title && <h2 className="alert-modal__title">{title}</h2>}
          </div>
          <div className="alert-modal__content">
            <p className="alert-modal__message">{message}</p>
          </div>
          <div className="alert-modal__footer">
            <button
              type="button"
              className={`alert-modal__button alert-modal__button--${variant}`}
              onClick={onClose}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </Popup>
  );
}
