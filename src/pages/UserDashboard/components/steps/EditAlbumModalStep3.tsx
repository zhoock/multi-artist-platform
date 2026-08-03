// src/pages/UserDashboard/components/steps/EditAlbumModalStep3.tsx
import React, { useState } from 'react';
import type {
  AlbumFormData,
  RecordingEntry,
  RecordingFormDraft,
} from '../modals/album/EditAlbumModal.types';
import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import '../shared/EditableCardField.style.scss';

import {
  parseRecordingText,
  buildRecordingText,
  recordingFormDraftIsDirty,
  recordingFormDraftCanSave,
  buildRecordingEntryFromEditFields,
  updateRecordingEntryPreservingId,
} from '../modals/album/EditAlbumModal.utils';
import { recordingEntryEditHasChanges } from '../modals/album/recordingEntryEditHasChanges';
import { InlineEditDiscardDialog, getInlineEditDiscardLabels } from '../shared/EditableCardField';
import {
  EditAlbumEditIcon,
  EditAlbumPlusIcon,
  EditAlbumRemoveIcon,
  editAlbumAddButtonLabel,
} from './EditAlbumStepIcons';

interface EditAlbumModalStep3Props {
  formData: AlbumFormData;
  onFormDataChange: (field: keyof AlbumFormData, value: AlbumFormData[keyof AlbumFormData]) => void;
  addRecordedAtDraft: RecordingFormDraft;
  addMixedAtDraft: RecordingFormDraft;
  addMasteringDraft: RecordingFormDraft;
  onPatchAddRecordedAtDraft: (patch: Partial<RecordingFormDraft>) => void;
  onPatchAddMixedAtDraft: (patch: Partial<RecordingFormDraft>) => void;
  onPatchAddMasteringDraft: (patch: Partial<RecordingFormDraft>) => void;
  onRequestEditRecordedAt: (index: number) => void;
  onRequestEditMixedAt: (index: number) => void;
  onRequestEditMastering: (index: number) => void;
  onSaveRecordedAtAdd: () => void;
  onSaveMixedAtAdd: () => void;
  onSaveMasteringAdd: () => void;
  onCancelRecordedAtAdd: () => void;
  onCancelMixedAtAdd: () => void;
  onCancelMasteringAdd: () => void;
  lang: SupportedLang;
  ui?: IInterface;
}

interface RecordingEntryEditorProps {
  data: {
    text: string;
    url?: string;
  };
  isEditing: boolean;
  dateFrom: string;
  dateTo: string;
  studioText: string;
  city: string;
  url: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onStudioTextChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove: () => void;
  hasUnsavedChanges?: boolean;
  canSave?: boolean;
  ui?: IInterface;
}

function RecordingEntryEditor({
  data,
  isEditing,
  dateFrom,
  dateTo,
  studioText,
  city,
  url,
  onDateFromChange,
  onDateToChange,
  onStudioTextChange,
  onCityChange,
  onUrlChange,
  onEdit,
  onSave,
  onCancel,
  onRemove,
  hasUnsavedChanges,
  canSave,
  ui,
}: RecordingEntryEditorProps) {
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
            <div className="edit-album-modal__two-column-inputs">
              <div className="edit-album-modal__date-input-shell">
                <input
                  type="date"
                  className="edit-album-modal__list-item-input edit-album-modal__list-item-input--title"
                  placeholder="From"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  onKeyDown={keyHandlers}
                />
              </div>
              <div className="edit-album-modal__date-input-shell">
                <input
                  type="date"
                  className="edit-album-modal__list-item-input edit-album-modal__list-item-input--title"
                  placeholder="To"
                  value={dateTo}
                  onChange={(e) => onDateToChange(e.target.value)}
                  onKeyDown={keyHandlers}
                />
              </div>
            </div>
            <input
              type="text"
              className="edit-album-modal__list-item-input edit-album-modal__list-item-input--description"
              placeholder="Studio info"
              value={studioText}
              onChange={(e) => onStudioTextChange(e.target.value)}
              onKeyDown={keyHandlers}
            />
            <input
              type="text"
              className="edit-album-modal__list-item-input edit-album-modal__list-item-input--description"
              placeholder="City"
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              onKeyDown={keyHandlers}
            />
            <input
              type="url"
              className="edit-album-modal__list-item-input edit-album-modal__list-item-input--url"
              placeholder="URL (optional)"
              value={url}
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
                {ui?.dashboard?.editAlbumModal?.step5?.save ?? 'Save'}
              </button>
              <button
                type="button"
                className="edit-album-modal__list-item-cancel"
                onClick={requestCancel}
              >
                {ui?.dashboard?.editAlbumModal?.step5?.cancel ?? 'Cancel'}
              </button>
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
        <span className="edit-album-modal__list-item-name">{data.text}</span>
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

export function EditAlbumModalStep3({
  formData,
  onFormDataChange,
  addRecordedAtDraft,
  addMixedAtDraft,
  addMasteringDraft,
  onPatchAddRecordedAtDraft,
  onPatchAddMixedAtDraft,
  onPatchAddMasteringDraft,
  onRequestEditRecordedAt,
  onRequestEditMixedAt,
  onRequestEditMastering,
  onSaveRecordedAtAdd,
  onSaveMixedAtAdd,
  onSaveMasteringAdd,
  onCancelRecordedAtAdd,
  onCancelMixedAtAdd,
  onCancelMasteringAdd,
  lang,
  ui,
}: EditAlbumModalStep3Props) {
  return (
    <>
      <div className="edit-album-modal__divider" />

      {/* Recorded At */}
      <div className="edit-album-modal__field">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step3?.recordedAt ?? 'Recorded At'}
        </label>

        {formData.recordedAt.length > 0 && (
          <div className="edit-album-modal__list">
            {formData.recordedAt.map((entry, index) => {
              const isEditing = formData.editingRecordedAtIndex === index;
              // Парсим только если нет прямых полей (для обратной совместимости)
              const parsed = entry.dateFrom ? {} : parseRecordingText(entry.text);
              const recordedAtHasUnsavedChanges =
                isEditing &&
                recordingEntryEditHasChanges(
                  entry,
                  parsed,
                  formData.recordedAtDateFrom ?? '',
                  formData.recordedAtDateTo ?? '',
                  formData.recordedAtText ?? '',
                  formData.recordedAtCity ?? '',
                  formData.recordedAtURL ?? ''
                );

              return (
                <RecordingEntryEditor
                  key={index}
                  data={{
                    text: entry.text,
                    url: entry.url,
                  }}
                  isEditing={isEditing}
                  dateFrom={
                    isEditing
                      ? (formData.recordedAtDateFrom ?? '')
                      : formData.recordedAtDateFrom || entry.dateFrom || parsed.dateFrom || ''
                  }
                  dateTo={
                    isEditing
                      ? (formData.recordedAtDateTo ?? '')
                      : formData.recordedAtDateTo || entry.dateTo || parsed.dateTo || ''
                  }
                  studioText={
                    isEditing
                      ? (formData.recordedAtText ?? '')
                      : formData.recordedAtText || entry.studioText || parsed.studioText || ''
                  }
                  city={
                    isEditing
                      ? (formData.recordedAtCity ?? '')
                      : formData.recordedAtCity || entry.city || ''
                  }
                  url={
                    isEditing
                      ? (formData.recordedAtURL ?? '')
                      : formData.recordedAtURL || entry.url || ''
                  }
                  onDateFromChange={(value: string) =>
                    onFormDataChange('recordedAtDateFrom', value)
                  }
                  onDateToChange={(value: string) => onFormDataChange('recordedAtDateTo', value)}
                  onStudioTextChange={(value: string) => onFormDataChange('recordedAtText', value)}
                  onCityChange={(value: string) => onFormDataChange('recordedAtCity', value)}
                  onUrlChange={(value: string) => onFormDataChange('recordedAtURL', value)}
                  onEdit={() => onRequestEditRecordedAt(index)}
                  onSave={() => {
                    const updated = [...formData.recordedAt];
                    updated[index] = updateRecordingEntryPreservingId(entry, {
                      text: buildRecordingText(
                        formData.recordedAtDateFrom,
                        formData.recordedAtDateTo,
                        formData.recordedAtText?.trim(),
                        formData.recordedAtCity?.trim(),
                        lang
                      ),
                      url: formData.recordedAtURL?.trim() || undefined,
                      dateFrom: formData.recordedAtDateFrom,
                      dateTo: formData.recordedAtDateTo,
                      studioText: formData.recordedAtText?.trim(),
                      city: formData.recordedAtCity?.trim(),
                    });
                    onFormDataChange('recordedAt', updated);
                    onFormDataChange('recordedAtDateFrom', '');
                    onFormDataChange('recordedAtDateTo', '');
                    onFormDataChange('recordedAtText', '');
                    onFormDataChange('recordedAtCity', '');
                    onFormDataChange('recordedAtURL', '');
                    onFormDataChange('editingRecordedAtIndex', null);
                  }}
                  onCancel={() => {
                    onFormDataChange('recordedAtDateFrom', '');
                    onFormDataChange('recordedAtDateTo', '');
                    onFormDataChange('recordedAtText', '');
                    onFormDataChange('recordedAtCity', '');
                    onFormDataChange('recordedAtURL', '');
                    onFormDataChange('editingRecordedAtIndex', null);
                  }}
                  onRemove={() => {
                    const updated = [...formData.recordedAt];
                    updated.splice(index, 1);
                    onFormDataChange('recordedAt', updated);
                  }}
                  hasUnsavedChanges={recordedAtHasUnsavedChanges}
                  ui={ui}
                />
              );
            })}
          </div>
        )}

        {(formData.recordedAt.length === 0 || formData.showAddRecordedAtInputs === true) && (
          <div className="edit-album-modal__list">
            <RecordingEntryEditor
              data={{ text: '', url: undefined }}
              isEditing={true}
              dateFrom={addRecordedAtDraft.dateFrom || ''}
              dateTo={addRecordedAtDraft.dateTo || ''}
              studioText={addRecordedAtDraft.studioText || ''}
              city={addRecordedAtDraft.city || ''}
              url={addRecordedAtDraft.url || ''}
              onDateFromChange={(value: string) => onPatchAddRecordedAtDraft({ dateFrom: value })}
              onDateToChange={(value: string) => onPatchAddRecordedAtDraft({ dateTo: value })}
              onStudioTextChange={(value: string) =>
                onPatchAddRecordedAtDraft({ studioText: value })
              }
              onCityChange={(value: string) => onPatchAddRecordedAtDraft({ city: value })}
              onUrlChange={(value: string) => onPatchAddRecordedAtDraft({ url: value })}
              onEdit={() => {}}
              onSave={onSaveRecordedAtAdd}
              onCancel={onCancelRecordedAtAdd}
              onRemove={() => {}}
              hasUnsavedChanges={recordingFormDraftIsDirty(addRecordedAtDraft)}
              canSave={recordingFormDraftCanSave(addRecordedAtDraft)}
              ui={ui}
            />
          </div>
        )}

        {formData.recordedAt && formData.recordedAt.length > 0 && (
          <button
            type="button"
            className="edit-album-modal__add-button"
            disabled={
              formData.editingRecordedAtIndex != null || formData.showAddRecordedAtInputs === true
            }
            onClick={() => onFormDataChange('showAddRecordedAtInputs', true)}
          >
            <EditAlbumPlusIcon size={14} />
            {editAlbumAddButtonLabel(ui?.dashboard?.editAlbumModal?.step3?.addButton ?? '+ Add')}
          </button>
        )}
      </div>

      {/* Mixed At */}
      <div className="edit-album-modal__field">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step3?.mixedAt ?? 'Mixed At'}
        </label>

        {formData.mixedAt.length > 0 && (
          <div className="edit-album-modal__list">
            {formData.mixedAt.map((entry, index) => {
              const isEditing = formData.editingMixedAtIndex === index;
              // Парсим только если нет прямых полей (для обратной совместимости)
              const parsed = entry.dateFrom ? {} : parseRecordingText(entry.text);
              const mixedAtHasUnsavedChanges =
                isEditing &&
                recordingEntryEditHasChanges(
                  entry,
                  parsed,
                  formData.mixedAtDateFrom ?? '',
                  formData.mixedAtDateTo ?? '',
                  formData.mixedAtText ?? '',
                  formData.mixedAtCity ?? '',
                  formData.mixedAtURL ?? ''
                );

              return (
                <RecordingEntryEditor
                  key={index}
                  data={{
                    text: entry.text,
                    url: entry.url,
                  }}
                  isEditing={isEditing}
                  dateFrom={
                    isEditing
                      ? (formData.mixedAtDateFrom ?? '')
                      : formData.mixedAtDateFrom || entry.dateFrom || parsed.dateFrom || ''
                  }
                  dateTo={
                    isEditing
                      ? (formData.mixedAtDateTo ?? '')
                      : formData.mixedAtDateTo || entry.dateTo || parsed.dateTo || ''
                  }
                  studioText={
                    isEditing
                      ? (formData.mixedAtText ?? '')
                      : formData.mixedAtText || entry.studioText || parsed.studioText || ''
                  }
                  city={
                    isEditing
                      ? (formData.mixedAtCity ?? '')
                      : formData.mixedAtCity || entry.city || ''
                  }
                  url={
                    isEditing ? (formData.mixedAtURL ?? '') : formData.mixedAtURL || entry.url || ''
                  }
                  onDateFromChange={(value: string) => onFormDataChange('mixedAtDateFrom', value)}
                  onDateToChange={(value: string) => onFormDataChange('mixedAtDateTo', value)}
                  onStudioTextChange={(value: string) => onFormDataChange('mixedAtText', value)}
                  onCityChange={(value: string) => onFormDataChange('mixedAtCity', value)}
                  onUrlChange={(value: string) => onFormDataChange('mixedAtURL', value)}
                  onEdit={() => onRequestEditMixedAt(index)}
                  onSave={() => {
                    const updated = [...formData.mixedAt];
                    updated[index] = updateRecordingEntryPreservingId(entry, {
                      text: buildRecordingText(
                        formData.mixedAtDateFrom,
                        formData.mixedAtDateTo,
                        formData.mixedAtText?.trim(),
                        formData.mixedAtCity?.trim(),
                        lang
                      ),
                      url: formData.mixedAtURL?.trim() || undefined,
                      dateFrom: formData.mixedAtDateFrom,
                      dateTo: formData.mixedAtDateTo,
                      studioText: formData.mixedAtText?.trim(),
                      city: formData.mixedAtCity?.trim(),
                    });
                    onFormDataChange('mixedAt', updated);
                    onFormDataChange('mixedAtDateFrom', '');
                    onFormDataChange('mixedAtDateTo', '');
                    onFormDataChange('mixedAtText', '');
                    onFormDataChange('mixedAtCity', '');
                    onFormDataChange('mixedAtURL', '');
                    onFormDataChange('editingMixedAtIndex', null);
                  }}
                  onCancel={() => {
                    onFormDataChange('mixedAtDateFrom', '');
                    onFormDataChange('mixedAtDateTo', '');
                    onFormDataChange('mixedAtText', '');
                    onFormDataChange('mixedAtCity', '');
                    onFormDataChange('mixedAtURL', '');
                    onFormDataChange('editingMixedAtIndex', null);
                  }}
                  onRemove={() => {
                    const updated = [...formData.mixedAt];
                    updated.splice(index, 1);
                    onFormDataChange('mixedAt', updated);
                  }}
                  hasUnsavedChanges={mixedAtHasUnsavedChanges}
                  ui={ui}
                />
              );
            })}
          </div>
        )}

        {(formData.mixedAt.length === 0 || formData.showAddMixedAtInputs === true) && (
          <div className="edit-album-modal__list">
            <RecordingEntryEditor
              data={{ text: '', url: undefined }}
              isEditing={true}
              dateFrom={addMixedAtDraft.dateFrom || ''}
              dateTo={addMixedAtDraft.dateTo || ''}
              studioText={addMixedAtDraft.studioText || ''}
              city={addMixedAtDraft.city || ''}
              url={addMixedAtDraft.url || ''}
              onDateFromChange={(value: string) => onPatchAddMixedAtDraft({ dateFrom: value })}
              onDateToChange={(value: string) => onPatchAddMixedAtDraft({ dateTo: value })}
              onStudioTextChange={(value: string) => onPatchAddMixedAtDraft({ studioText: value })}
              onCityChange={(value: string) => onPatchAddMixedAtDraft({ city: value })}
              onUrlChange={(value: string) => onPatchAddMixedAtDraft({ url: value })}
              onEdit={() => {}}
              onSave={onSaveMixedAtAdd}
              onCancel={onCancelMixedAtAdd}
              onRemove={() => {}}
              hasUnsavedChanges={recordingFormDraftIsDirty(addMixedAtDraft)}
              canSave={recordingFormDraftCanSave(addMixedAtDraft)}
              ui={ui}
            />
          </div>
        )}

        {formData.mixedAt && formData.mixedAt.length > 0 && (
          <button
            type="button"
            className="edit-album-modal__add-button"
            disabled={
              formData.editingMixedAtIndex != null || formData.showAddMixedAtInputs === true
            }
            onClick={() => onFormDataChange('showAddMixedAtInputs', true)}
          >
            <EditAlbumPlusIcon size={14} />
            {editAlbumAddButtonLabel(ui?.dashboard?.editAlbumModal?.step3?.addButton ?? '+ Add')}
          </button>
        )}
      </div>

      {/* Mastered By */}
      <div className="edit-album-modal__field">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step3?.masteredBy ?? 'Mastered By'}
        </label>

        {formData.mastering.length > 0 && (
          <div className="edit-album-modal__list">
            {formData.mastering.map((entry, index) => {
              const isEditing = formData.editingMasteringIndex === index;
              // Парсим только если нет прямых полей (для обратной совместимости)
              const parsed = entry.dateFrom ? {} : parseRecordingText(entry.text);
              const masteringHasUnsavedChanges =
                isEditing &&
                recordingEntryEditHasChanges(
                  entry,
                  parsed,
                  formData.masteringDateFrom ?? '',
                  formData.masteringDateTo ?? '',
                  formData.masteringText ?? '',
                  formData.masteringCity ?? '',
                  formData.masteringURL ?? ''
                );

              return (
                <RecordingEntryEditor
                  key={index}
                  data={{
                    text: entry.text,
                    url: entry.url,
                  }}
                  isEditing={isEditing}
                  dateFrom={
                    isEditing
                      ? (formData.masteringDateFrom ?? '')
                      : formData.masteringDateFrom || entry.dateFrom || parsed.dateFrom || ''
                  }
                  dateTo={
                    isEditing
                      ? (formData.masteringDateTo ?? '')
                      : formData.masteringDateTo || entry.dateTo || parsed.dateTo || ''
                  }
                  studioText={
                    isEditing
                      ? (formData.masteringText ?? '')
                      : formData.masteringText || entry.studioText || parsed.studioText || ''
                  }
                  city={
                    isEditing
                      ? (formData.masteringCity ?? '')
                      : formData.masteringCity || entry.city || ''
                  }
                  url={
                    isEditing
                      ? (formData.masteringURL ?? '')
                      : formData.masteringURL || entry.url || ''
                  }
                  onDateFromChange={(value: string) => onFormDataChange('masteringDateFrom', value)}
                  onDateToChange={(value: string) => onFormDataChange('masteringDateTo', value)}
                  onStudioTextChange={(value: string) => onFormDataChange('masteringText', value)}
                  onCityChange={(value: string) => onFormDataChange('masteringCity', value)}
                  onUrlChange={(value: string) => onFormDataChange('masteringURL', value)}
                  onEdit={() => onRequestEditMastering(index)}
                  onSave={() => {
                    const updated = [...formData.mastering];
                    updated[index] = updateRecordingEntryPreservingId(entry, {
                      text: buildRecordingText(
                        formData.masteringDateFrom,
                        formData.masteringDateTo,
                        formData.masteringText?.trim(),
                        formData.masteringCity?.trim(),
                        lang
                      ),
                      url: formData.masteringURL?.trim() || undefined,
                      dateFrom: formData.masteringDateFrom,
                      dateTo: formData.masteringDateTo,
                      studioText: formData.masteringText?.trim(),
                      city: formData.masteringCity?.trim(),
                    });
                    onFormDataChange('mastering', updated);
                    onFormDataChange('masteringDateFrom', '');
                    onFormDataChange('masteringDateTo', '');
                    onFormDataChange('masteringText', '');
                    onFormDataChange('masteringCity', '');
                    onFormDataChange('masteringURL', '');
                    onFormDataChange('editingMasteringIndex', null);
                  }}
                  onCancel={() => {
                    onFormDataChange('masteringDateFrom', '');
                    onFormDataChange('masteringDateTo', '');
                    onFormDataChange('masteringText', '');
                    onFormDataChange('masteringCity', '');
                    onFormDataChange('masteringURL', '');
                    onFormDataChange('editingMasteringIndex', null);
                  }}
                  onRemove={() => {
                    const updated = [...formData.mastering];
                    updated.splice(index, 1);
                    onFormDataChange('mastering', updated);
                  }}
                  hasUnsavedChanges={masteringHasUnsavedChanges}
                  ui={ui}
                />
              );
            })}
          </div>
        )}

        {(formData.mastering.length === 0 || formData.showAddMasteringInputs === true) && (
          <div className="edit-album-modal__list">
            <RecordingEntryEditor
              data={{ text: '', url: undefined }}
              isEditing={true}
              dateFrom={addMasteringDraft.dateFrom || ''}
              dateTo={addMasteringDraft.dateTo || ''}
              studioText={addMasteringDraft.studioText || ''}
              city={addMasteringDraft.city || ''}
              url={addMasteringDraft.url || ''}
              onDateFromChange={(value: string) => onPatchAddMasteringDraft({ dateFrom: value })}
              onDateToChange={(value: string) => onPatchAddMasteringDraft({ dateTo: value })}
              onStudioTextChange={(value: string) =>
                onPatchAddMasteringDraft({ studioText: value })
              }
              onCityChange={(value: string) => onPatchAddMasteringDraft({ city: value })}
              onUrlChange={(value: string) => onPatchAddMasteringDraft({ url: value })}
              onEdit={() => {}}
              onSave={onSaveMasteringAdd}
              onCancel={onCancelMasteringAdd}
              onRemove={() => {}}
              hasUnsavedChanges={recordingFormDraftIsDirty(addMasteringDraft)}
              canSave={recordingFormDraftCanSave(addMasteringDraft)}
              ui={ui}
            />
          </div>
        )}

        {formData.mastering && formData.mastering.length > 0 && (
          <button
            type="button"
            className="edit-album-modal__add-button"
            disabled={
              formData.editingMasteringIndex != null || formData.showAddMasteringInputs === true
            }
            onClick={() => onFormDataChange('showAddMasteringInputs', true)}
          >
            <EditAlbumPlusIcon size={14} />
            {editAlbumAddButtonLabel(ui?.dashboard?.editAlbumModal?.step3?.addButton ?? '+ Add')}
          </button>
        )}
      </div>
    </>
  );
}
