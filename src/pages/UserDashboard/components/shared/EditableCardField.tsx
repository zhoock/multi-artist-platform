// src/pages/UserDashboard/components/shared/EditableCardField.tsx
import React, { useState } from 'react';
import type { IInterface } from '@models';
import { EditAlbumEditIcon, EditAlbumRemoveIcon } from '../steps/EditAlbumStepIcons';
import './EditableCardField.style.scss';

export interface EditableCardFieldData {
  title: string; // Заголовок (жирный, сверху слева)
  description?: string; // 1-2 строки описания (мелкий текст под заголовком)
  url?: string; // Нижняя строка для URL/доп. значения
}

export interface InlineEditDiscardDialogLabels {
  message: string;
  stay: string;
  discard: string;
}
/**
 * Отрендерите как потомка того же нативного `<dialog>`, что и `Popup`,
 * чтобы оверлей был в top layer после `showModal()` и был видим.
 */
export function InlineEditDiscardDialog({
  open,
  labels,
  onStay,
  onDiscard,
  titleId = 'edit-album-inline-discard-title',
}: {
  open: boolean;
  labels: InlineEditDiscardDialogLabels;
  onStay: () => void;
  onDiscard: () => void;
  /** Уникальный id для a11y, если несколько диалогов в одном слое. */
  titleId?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="edit-album-modal__inline-discard-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onStay}
    >
      <div className="edit-album-modal__inline-discard-panel" onClick={(e) => e.stopPropagation()}>
        <p id={titleId} className="edit-album-modal__inline-discard-message">
          {labels.message}
        </p>
        <div className="edit-album-modal__inline-discard-actions">
          <button type="button" className="edit-album-modal__inline-discard-stay" onClick={onStay}>
            {labels.stay}
          </button>
          <button
            type="button"
            className="edit-album-modal__inline-discard-discard"
            onClick={onDiscard}
          >
            {labels.discard}
          </button>
        </div>
      </div>
    </div>
  );
}

export function getInlineEditDiscardLabels(ui?: IInterface): InlineEditDiscardDialogLabels {
  const d = ui?.dashboard?.editAlbumModal?.discardInlineEdit;
  return {
    message: d?.message ?? '',
    stay: d?.stay ?? '',
    discard: d?.discard ?? '',
  };
}

/**
 * Тексты для глобального диалога в `EditAlbumModal` при смене редактируемой строки.
 * Кнопки ✎ в списках не блокируются — при конфликте показывается этот диалог.
 */
export function getSwitchEditConfirmLabels(ui?: IInterface): InlineEditDiscardDialogLabels {
  const d = ui?.dashboard?.editAlbumModal?.switchEditConfirm;
  return {
    message: d?.message ?? '',
    stay: d?.stay ?? '',
    discard: d?.discard ?? '',
  };
}

export function getCloseDiscardConfirmLabels(
  ui?: IInterface | null
): InlineEditDiscardDialogLabels {
  const d = ui?.dashboard?.closeDiscardConfirm;
  return {
    message: d?.message ?? '',
    stay: d?.stay ?? '',
    discard: d?.discard ?? '',
  };
}

export interface EditableCardFieldProps {
  data: EditableCardFieldData;
  isEditing: boolean;
  editTitle: string;
  editDescription: string;
  editUrl: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
  titlePlaceholder?: string;
  descriptionPlaceholder?: string;
  urlPlaceholder?: string;
  showCancel?: boolean; // Если false, только save + remove
  /** Есть несохранённые правки (для подтверждения отмены и т.д.). */
  hasUnsavedChanges?: boolean;
  /** Если задано, Save активен только при hasUnsavedChanges && canSave (например, новая строка: есть ввод, но ещё не валидна). */
  canSave?: boolean;
  /** Фокус в поле Name при входе в режим редактирования (по умолчанию true). */
  autoFocusTitle?: boolean;
  ui?: IInterface;
}

export function EditableCardField({
  data,
  isEditing,
  editTitle,
  editDescription,
  editUrl,
  onTitleChange,
  onDescriptionChange,
  onUrlChange,
  onEdit,
  onSave,
  onCancel,
  onRemove,
  titlePlaceholder = 'Title',
  descriptionPlaceholder = 'Description (optional)',
  urlPlaceholder = 'URL (optional)',
  showCancel = true,
  hasUnsavedChanges,
  canSave,
  autoFocusTitle = true,
  ui,
}: EditableCardFieldProps) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const discardLabels = getInlineEditDiscardLabels(ui);

  const saveDisabled =
    hasUnsavedChanges === undefined
      ? false
      : canSave !== undefined
        ? !hasUnsavedChanges || !canSave
        : !hasUnsavedChanges;
  const shouldConfirmDiscard = hasUnsavedChanges === true;

  const requestCancel = () => {
    if (!shouldConfirmDiscard) {
      onCancel();
      return;
    }
    setShowDiscardConfirm(true);
  };

  const handleStay = () => setShowDiscardConfirm(false);
  const handleDiscard = () => {
    setShowDiscardConfirm(false);
    onCancel();
  };

  const trySave = () => {
    if (!saveDisabled) onSave();
  };

  const keyHandlers = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      trySave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (showDiscardConfirm) {
        handleStay();
        return;
      }
      requestCancel();
    }
  };

  if (isEditing) {
    return (
      <>
        <div className="edit-album-modal__list-item edit-album-modal__list-item--editing">
          <div className="edit-album-modal__list-item-edit-wrapper">
            <input
              type="text"
              className="edit-album-modal__list-item-input edit-album-modal__list-item-input--title"
              placeholder={titlePlaceholder}
              value={editTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              autoFocus={autoFocusTitle}
              onKeyDown={keyHandlers}
            />
            {descriptionPlaceholder && descriptionPlaceholder.trim() !== '' && (
              <input
                type="text"
                className="edit-album-modal__list-item-input edit-album-modal__list-item-input--description"
                placeholder={descriptionPlaceholder}
                value={editDescription}
                onChange={(e) => onDescriptionChange(e.target.value)}
                onKeyDown={keyHandlers}
              />
            )}
            <input
              type="url"
              className="edit-album-modal__list-item-input edit-album-modal__list-item-input--url"
              placeholder={urlPlaceholder}
              value={editUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              onKeyDown={keyHandlers}
            />
            <div className="edit-album-modal__list-item-actions">
              <button
                type="button"
                className="edit-album-modal__list-item-save"
                onClick={trySave}
                disabled={saveDisabled}
              >
                {ui?.dashboard?.editAlbumModal?.step5?.save ?? ''}
              </button>
              {showCancel && (
                <button
                  type="button"
                  className="edit-album-modal__list-item-cancel"
                  onClick={requestCancel}
                >
                  {ui?.dashboard?.editAlbumModal?.step5?.cancel ?? ''}
                </button>
              )}
            </div>
          </div>
        </div>
        <InlineEditDiscardDialog
          open={showDiscardConfirm}
          labels={discardLabels}
          onStay={handleStay}
          onDiscard={handleDiscard}
        />
      </>
    );
  }

  return (
    <div className="edit-album-modal__list-item">
      <div className="edit-album-modal__list-item-content">
        <span className="edit-album-modal__list-item-name">{data.title}</span>
        {data.description && (
          <span className="edit-album-modal__list-item-role">{data.description}</span>
        )}
        {data.url && <span className="edit-album-modal__list-item-url">{data.url}</span>}
      </div>
      <div className="edit-album-modal__list-item-actions">
        <button
          type="button"
          className="edit-album-modal__list-item-edit"
          onClick={onEdit}
          aria-label="Edit"
        >
          <EditAlbumEditIcon />
        </button>
        <button
          type="button"
          className="edit-album-modal__list-item-remove"
          onClick={onRemove}
          aria-label="Remove"
        >
          <EditAlbumRemoveIcon />
        </button>
      </div>
    </div>
  );
}
