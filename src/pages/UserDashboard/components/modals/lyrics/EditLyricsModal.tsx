// src/pages/UserDashboard/components/EditLyricsModal.tsx
import React, { useCallback, useMemo, useRef } from 'react';
import { Popup } from '@shared/ui/popup';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import { useDashboardSaveLock } from '@shared/lib/hooks/useDashboardSaveLock';
import { useModalDraftSession } from '@shared/lib/hooks/useModalDraftSession';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import '@shared/ui/dashboard-save/dashboard-save.scss';
import { useCloseWithUnsavedConfirmation } from '@shared/lib/hooks/useCloseWithUnsavedConfirmation';
import {
  InlineEditDiscardDialog,
  getCloseDiscardConfirmLabels,
} from '../../shared/EditableCardField';
import './EditLyricsModal.style.scss';

type EditLyricsDraft = {
  lyrics: string;
  authorship: string;
};

function areEditLyricsDraftsEqual(left: EditLyricsDraft, right: EditLyricsDraft): boolean {
  return (
    left.lyrics.trim() === right.lyrics.trim() && left.authorship.trim() === right.authorship.trim()
  );
}

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

  const baseline = useMemo<EditLyricsDraft>(
    () => ({
      lyrics: initialLyrics,
      authorship: initialAuthorship || '',
    }),
    [initialLyrics, initialAuthorship]
  );

  const { draft, setDraft, hasChanges, discardDraft, commitDraft } = useModalDraftSession({
    isOpen,
    baseline,
    isEqual: areEditLyricsDraftsEqual,
  });

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

  const finalizeLyricsModalClose = useCallback(() => {
    discardDraft();
    onClose();
  }, [discardDraft, onClose]);

  const cancelAndClose = useCallback(() => {
    if (isSaving) return;
    discardDraft();
    closeDialog();
  }, [closeDialog, discardDraft, isSaving]);

  const handleSave = () => {
    void withSaving(async () => {
      try {
        const authorship = draft.authorship.trim();
        await onSave(draft.lyrics, authorship || undefined);
        commitDraft({
          lyrics: draft.lyrics,
          authorship,
        });
        onClose();
      } catch (error) {
        console.error('Error saving lyrics:', error);
      }
    });
  };

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

          <div className="edit-lyrics-modal__body">
            <div className="edit-lyrics-modal__content-column">
              <textarea
                className="edit-lyrics-modal__textarea"
                value={draft.lyrics}
                onChange={(e) => setDraft({ ...draft, lyrics: e.target.value })}
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
                    ui?.dashboard?.authorshipPlaceholder ??
                    'For example: John Doe — words and music'
                  }
                  value={draft.authorship}
                  onChange={(e) => setDraft({ ...draft, authorship: e.target.value })}
                  onFocus={(e) => {
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
            </div>
          </div>

          <div className="edit-lyrics-modal__divider" />

          <div className="edit-lyrics-modal__actions">
            <div className="edit-lyrics-modal__actions-bar">
              <button
                type="button"
                className="edit-lyrics-modal__button edit-lyrics-modal__button--cancel"
                onClick={cancelAndClose}
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
      </div>
      <InlineEditDiscardDialog
        open={lyricsCloseGuard.discardDialogOpen}
        labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
        titleId={lyricsCloseGuard.discardTitleDomId}
        onStay={lyricsCloseGuard.dismissDiscardDialog}
        onDiscard={() => {
          discardDraft();
          lyricsCloseGuard.finalizeCloseWithoutSaving();
        }}
      />
    </Popup>
  );
}
