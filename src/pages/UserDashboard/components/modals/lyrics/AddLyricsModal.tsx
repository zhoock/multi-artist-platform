// src/pages/UserDashboard/components/AddLyricsModal.tsx
import React, { useCallback, useState, useRef } from 'react';
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
import './AddLyricsModal.style.scss';

interface AddLyricsModalProps {
  isOpen: boolean;
  trackTitle: string;
  onClose: () => void;
  onSave: (lyrics: string, authorship?: string) => void | Promise<void>;
  onPreview?: () => void;
}

export function AddLyricsModal({
  isOpen,
  trackTitle,
  onClose,
  onSave,
  onPreview,
}: AddLyricsModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [lyricsText, setLyricsText] = useState('');
  const [authorship, setAuthorship] = useState('');
  const { isSaving, withSaving } = useDashboardSaveLock();

  const hasLyricsBody = lyricsText.trim().length > 0;

  const hasUnsavedContent = lyricsText.trim().length > 0 || authorship.trim().length > 0;

  const finalizeModalClose = useCallback(() => {
    setLyricsText('');
    setAuthorship('');
    onClose();
  }, [onClose]);

  const popupRequestCloseRef = useRef<(() => void) | null>(null);
  const closeDialog = useCallback(() => {
    popupRequestCloseRef.current?.();
  }, []);

  const lyricsAddCloseGuard = useCloseWithUnsavedConfirmation({
    isOpen,
    isBusy: isSaving,
    hasUnsavedChanges: hasUnsavedContent,
    closeDialog,
  });

  const handleSave = () => {
    if (!lyricsText.trim()) return;
    void withSaving(async () => {
      await Promise.resolve(onSave(lyricsText, authorship.trim() || undefined));
      setLyricsText('');
      setAuthorship('');
    });
  };

  return (
    <Popup
      isActive={isOpen}
      onClose={finalizeModalClose}
      onCancelRequest={() => lyricsAddCloseGuard.requestClose()}
      requestCloseRef={popupRequestCloseRef}
      closeBlocked={isSaving || lyricsAddCloseGuard.discardDialogOpen}
    >
      <div className="add-lyrics-modal">
        <div
          className={`add-lyrics-modal__card${isSaving ? ' dashboard-save-card--busy' : ''}`}
          aria-busy={isSaving}
        >
          <div className="add-lyrics-modal__header">
            <div className="add-lyrics-modal__header-main">
              <h2 className="add-lyrics-modal__title">
                {ui?.dashboard?.addLyrics ?? 'Add Lyrics'}
              </h2>
              <p className="add-lyrics-modal__subtitle">{trackTitle}</p>
            </div>
            <div className="add-lyrics-modal__header-trailing">
              {onPreview ? (
                <button
                  type="button"
                  className="add-lyrics-modal__preview-button"
                  onClick={onPreview}
                  disabled={isSaving}
                >
                  {ui?.dashboard?.preview ?? 'Preview'}
                </button>
              ) : null}
              <button
                type="button"
                className="add-lyrics-modal__close"
                onClick={() => lyricsAddCloseGuard.requestClose()}
                disabled={isSaving}
                aria-label={ui?.dashboard?.close ?? 'Close'}
              >
                <ModalCloseIcon />
              </button>
            </div>
          </div>
          <textarea
            className="add-lyrics-modal__textarea"
            placeholder={ui?.dashboard?.insertLyricsHere ?? 'Insert lyrics here…'}
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
          />
          <div className="add-lyrics-modal__divider"></div>
          <div className="add-lyrics-modal__field">
            <label className="add-lyrics-modal__label">
              {ui?.dashboard?.authorship ?? 'Written by: '}
            </label>
            <input
              type="text"
              className="add-lyrics-modal__input"
              name="authorship"
              id="authorship"
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
              onFocus={(e) => e.stopPropagation()}
              onBlur={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              onKeyPress={(e) => e.stopPropagation()}
              onInput={(e) => e.stopPropagation()}
            />
          </div>
          <div className="add-lyrics-modal__divider"></div>
          <div className="add-lyrics-modal__actions">
            <button
              type="button"
              className="add-lyrics-modal__button add-lyrics-modal__button--cancel"
              onClick={() => lyricsAddCloseGuard.requestClose()}
              disabled={isSaving}
            >
              {ui?.dashboard?.cancel ?? 'Cancel'}
            </button>
            <button
              type="button"
              className={`add-lyrics-modal__button add-lyrics-modal__button--primary${
                isSaving ? ' add-lyrics-modal__button--primary-loading' : ''
              }`}
              onClick={handleSave}
              disabled={isSaving || !hasLyricsBody}
            >
              {isSaving ? (
                <>
                  <DashboardSaveSpinner />
                  {ui?.dashboard?.saving ?? 'Saving...'}
                </>
              ) : (
                (ui?.dashboard?.addLyrics ?? 'Add Lyrics')
              )}
            </button>
          </div>
        </div>
      </div>
      <InlineEditDiscardDialog
        open={lyricsAddCloseGuard.discardDialogOpen}
        labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
        titleId={lyricsAddCloseGuard.discardTitleDomId}
        onStay={lyricsAddCloseGuard.dismissDiscardDialog}
        onDiscard={lyricsAddCloseGuard.finalizeCloseWithoutSaving}
      />
    </Popup>
  );
}
