// src/pages/UserDashboard/components/EditLyricsModal.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Popup } from '@shared/ui/popup';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import { useDashboardSaveLock } from '@shared/lib/hooks/useDashboardSaveLock';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import '@shared/ui/dashboard-save/dashboard-save.scss';
import { useCloseWithUnsavedConfirmation } from '@shared/lib/hooks/useCloseWithUnsavedConfirmation';
import {
  InlineEditDiscardDialog,
  getCloseDiscardConfirmLabels,
} from '../../shared/EditableCardField';
import './EditLyricsModal.style.scss';

interface EditLyricsModalProps {
  isOpen: boolean;
  initialLyrics: string;
  initialAuthorship?: string;
  onClose: () => void;
  onSave: (lyrics: string, authorship?: string) => Promise<void> | void;
}

export function EditLyricsModal({
  isOpen,
  initialLyrics,
  initialAuthorship,
  onClose,
  onSave,
}: EditLyricsModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { isSaving, withSaving } = useDashboardSaveLock();
  const [lyricsText, setLyricsText] = useState(initialLyrics);
  const [authorship, setAuthorship] = useState(initialAuthorship || '');

  // Исходные значения для отслеживания изменений
  const [initialLyricsValue, setInitialLyricsValue] = useState(initialLyrics);
  const [initialAuthorshipValue, setInitialAuthorshipValue] = useState(initialAuthorship || '');

  // Обновляем состояние при изменении initialLyrics или initialAuthorship
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[EditLyricsModal] initialLyrics changed:', {
        initialLyricsLength: initialLyrics.length,
        currentLyricsLength: lyricsText.length,
        isOpen,
      });
    }
    // Обновляем только если модалка открыта, чтобы не сбрасывать изменения пользователя при закрытии
    if (isOpen) {
      setLyricsText(initialLyrics);
      setAuthorship(initialAuthorship || '');
      setInitialLyricsValue(initialLyrics);
      setInitialAuthorshipValue(initialAuthorship || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLyrics, initialAuthorship, isOpen]);

  // Проверка наличия изменений
  const hasChanges = useMemo(() => {
    return (
      lyricsText.trim() !== initialLyricsValue.trim() ||
      authorship.trim() !== initialAuthorshipValue.trim()
    );
  }, [lyricsText, initialLyricsValue, authorship, initialAuthorshipValue]);

  // Отмена изменений
  const handleCancel = useCallback(() => {
    setLyricsText(initialLyricsValue);
    setAuthorship(initialAuthorshipValue);
  }, [initialLyricsValue, initialAuthorshipValue]);

  const handleSave = () => {
    void withSaving(async () => {
      try {
        await onSave(lyricsText, authorship.trim() || undefined);
        setInitialLyricsValue(lyricsText);
        setInitialAuthorshipValue(authorship.trim() || '');
        onClose();
      } catch (error) {
        console.error('Error saving lyrics:', error);
      }
    });
  };

  const finalizeLyricsModalClose = useCallback(() => {
    if (hasChanges) handleCancel();
    onClose();
  }, [hasChanges, handleCancel, onClose]);

  const popupRequestCloseRef = useRef<(() => void) | null>(null);
  const closeDialog = useCallback(() => {
    popupRequestCloseRef.current?.();
  }, []);

  const lyricsCloseGuard = useCloseWithUnsavedConfirmation({
    isOpen,
    isBusy: isSaving,
    hasUnsavedChanges: hasChanges,
    closeDialog,
  });

  return (
    <Popup
      isActive={isOpen}
      onClose={finalizeLyricsModalClose}
      onCancelRequest={() => lyricsCloseGuard.requestClose()}
      requestCloseRef={popupRequestCloseRef}
      closeBlocked={isSaving || lyricsCloseGuard.discardDialogOpen}
    >
      <div className="edit-lyrics-modal">
        <div
          className={`edit-lyrics-modal__card${isSaving ? ' dashboard-save-card--busy' : ''}`}
          aria-busy={isSaving}
        >
          <div className="edit-lyrics-modal__header">
            <h2 className="edit-lyrics-modal__title">
              {ui?.dashboard?.editLyrics ?? 'Edit Lyrics'}
            </h2>
            <button
              type="button"
              className="edit-lyrics-modal__close"
              onClick={() => lyricsCloseGuard.requestClose()}
              disabled={isSaving}
              aria-label={ui?.dashboard?.close ?? 'Close'}
            >
              <ModalCloseIcon />
            </button>
          </div>

          <div className="edit-lyrics-modal__divider" />

          <textarea
            className="edit-lyrics-modal__textarea"
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
          />

          <div className="edit-lyrics-modal__field">
            <label className="edit-lyrics-modal__label" htmlFor="edit-lyrics-authorship">
              {ui?.dashboard?.authorship ?? 'Written by: '}
            </label>
            <input
              type="text"
              className="edit-lyrics-modal__input"
              name="authorship"
              id="edit-lyrics-authorship"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-gramm="false"
              data-lpignore="true"
              data-form-type="other"
              inputMode="text"
              aria-autocomplete="none"
              placeholder={
                ui?.dashboard?.authorshipPlaceholder ?? 'For example: John Doe — words and music'
              }
              value={authorship}
              onChange={(e) => setAuthorship(e.target.value)}
              onFocus={(e) => {
                // Предотвращаем всплытие события, чтобы избежать конфликтов с расширениями браузера
                e.stopPropagation();
              }}
              onBlur={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
              }}
              onKeyUp={(e) => {
                e.stopPropagation();
              }}
              onKeyPress={(e) => {
                e.stopPropagation();
              }}
              onInput={(e) => {
                e.stopPropagation();
              }}
            />
          </div>

          <div className="edit-lyrics-modal__divider" />

          <div className="edit-lyrics-modal__actions">
            <button
              type="button"
              className="edit-lyrics-modal__button edit-lyrics-modal__button--cancel"
              onClick={handleCancel}
              disabled={isSaving}
            >
              {ui?.dashboard?.cancel ?? 'Cancel'}
            </button>
            <button
              type="button"
              className={`edit-lyrics-modal__button edit-lyrics-modal__button--primary${
                isSaving ? ' edit-lyrics-modal__button--primary-loading' : ''
              }`}
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
                <>
                  <DashboardSaveSpinner />
                  {ui?.dashboard?.saving ?? 'Saving...'}
                </>
              ) : (
                (ui?.dashboard?.save ?? 'Save')
              )}
            </button>
          </div>
        </div>
      </div>
      <InlineEditDiscardDialog
        open={lyricsCloseGuard.discardDialogOpen}
        labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
        titleId={lyricsCloseGuard.discardTitleDomId}
        onStay={lyricsCloseGuard.dismissDiscardDialog}
        onDiscard={lyricsCloseGuard.finalizeCloseWithoutSaving}
      />
    </Popup>
  );
}
