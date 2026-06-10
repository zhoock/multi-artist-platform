// src/pages/UserDashboard/components/steps/EditAlbumModalStep4.tsx
import React from 'react';
import type { AlbumFormData } from '../modals/album/EditAlbumModal.types';
import type { AlbumStep4InvalidField } from '../modals/album/EditAlbumModal.utils';
import type { IInterface } from '@models';
import { MAX_BAND_MEMBERS } from '../modals/album/EditAlbumModal.constants';
import { bandMemberEditHasChanges, EMPTY_BAND_MEMBER } from '../modals/album/EditAlbumModal.utils';
import { EditableCardField } from '../shared/EditableCardField';
import '../shared/EditableCardField.style.scss';
import { EditAlbumPlusIcon, editAlbumAddButtonLabel } from './EditAlbumStepIcons';

interface EditAlbumModalStep4Props {
  formData: AlbumFormData;
  addBandMemberName: string;
  addBandMemberRole: string;
  addBandMemberURL: string;
  bandMemberName: string;
  bandMemberRole: string;
  bandMemberURL: string;
  editingBandMemberIndex: number | null;
  addSessionMusicianName: string;
  addSessionMusicianRole: string;
  addSessionMusicianURL: string;
  sessionMusicianName: string;
  sessionMusicianRole: string;
  sessionMusicianURL: string;
  editingSessionMusicianIndex: number | null;
  addProducerName: string;
  addProducerRole: string;
  addProducerURL: string;
  producerName: string;
  producerRole: string;
  producerURL: string;
  editingProducerIndex: number | null;
  onFormDataChange: (field: keyof AlbumFormData, value: any) => void;
  onAddBandMemberNameChange: (value: string) => void;
  onAddBandMemberRoleChange: (value: string) => void;
  onAddBandMemberURLChange: (value: string) => void;
  onBandMemberNameChange: (value: string) => void;
  onBandMemberRoleChange: (value: string) => void;
  onBandMemberURLChange: (value: string) => void;
  onAddBandMember: () => void;
  onEditBandMember: (index: number) => void;
  onRemoveBandMember: (index: number) => void;
  onCancelEditBandMember: () => void;
  onAddSessionMusicianNameChange: (value: string) => void;
  onAddSessionMusicianRoleChange: (value: string) => void;
  onAddSessionMusicianURLChange: (value: string) => void;
  onSessionMusicianNameChange: (value: string) => void;
  onSessionMusicianRoleChange: (value: string) => void;
  onSessionMusicianURLChange: (value: string) => void;
  onAddSessionMusician: () => void;
  onEditSessionMusician: (index: number) => void;
  onRemoveSessionMusician: (index: number) => void;
  onCancelEditSessionMusician: () => void;
  onAddProducerNameChange: (value: string) => void;
  onAddProducerRoleChange: (value: string) => void;
  onAddProducerURLChange: (value: string) => void;
  onProducerNameChange: (value: string) => void;
  onProducerRoleChange: (value: string) => void;
  onProducerURLChange: (value: string) => void;
  onAddProducer: () => void;
  onEditProducer: (index: number) => void;
  onRemoveProducer: (index: number) => void;
  onCancelEditProducer: () => void;
  step4InvalidFields?: AlbumStep4InvalidField[];
  ui?: IInterface;
}

export function EditAlbumModalStep4({
  formData,
  addBandMemberName,
  addBandMemberRole,
  addBandMemberURL,
  bandMemberName,
  bandMemberRole,
  bandMemberURL,
  editingBandMemberIndex,
  addSessionMusicianName,
  addSessionMusicianRole,
  addSessionMusicianURL,
  sessionMusicianName,
  sessionMusicianRole,
  sessionMusicianURL,
  editingSessionMusicianIndex,
  addProducerName,
  addProducerRole,
  addProducerURL,
  producerName,
  producerRole,
  producerURL,
  editingProducerIndex,
  onFormDataChange,
  onAddBandMemberNameChange,
  onAddBandMemberRoleChange,
  onAddBandMemberURLChange,
  onBandMemberNameChange,
  onBandMemberRoleChange,
  onBandMemberURLChange,
  onAddBandMember,
  onEditBandMember,
  onRemoveBandMember,
  onCancelEditBandMember,
  onAddSessionMusicianNameChange,
  onAddSessionMusicianRoleChange,
  onAddSessionMusicianURLChange,
  onSessionMusicianNameChange,
  onSessionMusicianRoleChange,
  onSessionMusicianURLChange,
  onAddSessionMusician,
  onEditSessionMusician,
  onRemoveSessionMusician,
  onCancelEditSessionMusician,
  onAddProducerNameChange,
  onAddProducerRoleChange,
  onAddProducerURLChange,
  onProducerNameChange,
  onProducerRoleChange,
  onProducerURLChange,
  onAddProducer,
  onEditProducer,
  onRemoveProducer,
  onCancelEditProducer,
  step4InvalidFields = [],
  ui,
}: EditAlbumModalStep4Props) {
  const s4inv = ui?.dashboard?.editAlbumModal?.step4Validation;
  const step4Err = (f: AlbumStep4InvalidField) => step4InvalidFields.includes(f);
  const bandListInvalid = step4Err('bandMembers');
  const producerListInvalid = step4Err('producer');

  return (
    <>
      <div className="edit-album-modal__divider" />

      <div className="edit-album-modal__field" data-step4-field="albumCoverDesigner">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step4?.albumCover ?? 'Album Cover'}
        </label>
        <div className="edit-album-modal__two-column-inputs">
          <div>
            <input
              name="album-cover-photographer"
              type="text"
              autoComplete="name"
              className="edit-album-modal__input"
              placeholder={
                ui?.dashboard?.editAlbumModal?.step4?.photographer ?? 'Photographer (optional)'
              }
              value={formData.albumCoverPhotographer}
              onChange={(e) => onFormDataChange('albumCoverPhotographer', e.target.value)}
            />
            <input
              name="album-cover-photographer-url"
              type="url"
              autoComplete="url"
              className="edit-album-modal__input"
              placeholder={
                ui?.dashboard?.editAlbumModal?.step4?.photographerUrl ??
                'Photographer URL (optional)'
              }
              value={formData.albumCoverPhotographerURL}
              onChange={(e) => onFormDataChange('albumCoverPhotographerURL', e.target.value)}
            />
          </div>
          <div>
            <input
              name="album-cover-designer"
              type="text"
              autoComplete="name"
              className={`edit-album-modal__input${step4Err('albumCoverDesigner') ? ' edit-album-modal__input--invalid' : ''}`}
              placeholder={ui?.dashboard?.editAlbumModal?.step4?.designer ?? 'Designer'}
              required
              aria-invalid={step4Err('albumCoverDesigner')}
              aria-describedby={
                step4Err('albumCoverDesigner') ? 'step4-cover-designer-error' : undefined
              }
              value={formData.albumCoverDesigner}
              onChange={(e) => onFormDataChange('albumCoverDesigner', e.target.value)}
              autoFocus
            />
            <input
              name="album-cover-designer-url"
              type="url"
              autoComplete="url"
              className="edit-album-modal__input"
              placeholder={
                ui?.dashboard?.editAlbumModal?.step4?.designerUrl ?? 'Designer URL (optional)'
              }
              value={formData.albumCoverDesignerURL}
              onChange={(e) => onFormDataChange('albumCoverDesignerURL', e.target.value)}
            />
          </div>
        </div>
        {step4Err('albumCoverDesigner') ? (
          <p id="step4-cover-designer-error" className="edit-album-modal__field-error" role="alert">
            {s4inv?.requiredDesigner}
          </p>
        ) : null}
      </div>

      <div className="edit-album-modal__field" data-step4-field="bandMembers">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step4?.bandMembers ?? 'Band Members'}
        </label>

        {formData.bandMembers.length > 0 && (
          <div
            className={`edit-album-modal__list${bandListInvalid ? ' edit-album-modal__list--invalid' : ''}`}
          >
            {formData.bandMembers.map((member, index) => (
              <EditableCardField
                key={index}
                data={{
                  title: member.name,
                  description: member.role,
                  url: member.url,
                }}
                isEditing={editingBandMemberIndex === index}
                editTitle={bandMemberName}
                editDescription={bandMemberRole}
                editUrl={bandMemberURL}
                onTitleChange={onBandMemberNameChange}
                onDescriptionChange={onBandMemberRoleChange}
                onUrlChange={onBandMemberURLChange}
                onEdit={() => onEditBandMember(index)}
                onSave={onAddBandMember}
                onCancel={onCancelEditBandMember}
                onRemove={() => onRemoveBandMember(index)}
                titlePlaceholder="Name"
                descriptionPlaceholder="Role"
                urlPlaceholder="URL (optional)"
                hasUnsavedChanges={
                  editingBandMemberIndex === index &&
                  bandMemberEditHasChanges(member, bandMemberName, bandMemberRole, bandMemberURL)
                }
                ui={ui}
              />
            ))}
          </div>
        )}

        {formData.bandMembers.length >= MAX_BAND_MEMBERS && (
          <div className="edit-album-modal__help-text">
            Maximum {MAX_BAND_MEMBERS} band members reached
          </div>
        )}

        {(formData.bandMembers.length === 0 || formData.showAddBandMemberInputs === true) &&
          formData.bandMembers.length < MAX_BAND_MEMBERS && (
            <div
              className={`edit-album-modal__list${bandListInvalid ? ' edit-album-modal__list--invalid' : ''}`}
            >
              <EditableCardField
                data={{ title: '', description: '', url: '' }}
                isEditing={true}
                editTitle={addBandMemberName}
                editDescription={addBandMemberRole}
                editUrl={addBandMemberURL}
                onTitleChange={onAddBandMemberNameChange}
                onDescriptionChange={onAddBandMemberRoleChange}
                onUrlChange={onAddBandMemberURLChange}
                onEdit={() => {}}
                onSave={onAddBandMember}
                onCancel={onCancelEditBandMember}
                onRemove={() => {}}
                titlePlaceholder={ui?.dashboard?.editAlbumModal?.step4?.name ?? 'Name'}
                descriptionPlaceholder={ui?.dashboard?.editAlbumModal?.step4?.role ?? 'Role'}
                urlPlaceholder={
                  ui?.dashboard?.editAlbumModal?.step4?.urlOptional ?? 'URL (optional)'
                }
                hasUnsavedChanges={bandMemberEditHasChanges(
                  EMPTY_BAND_MEMBER,
                  addBandMemberName,
                  addBandMemberRole,
                  addBandMemberURL
                )}
                canSave={Boolean(addBandMemberName.trim() && addBandMemberRole.trim())}
                autoFocusTitle={
                  formData.bandMembers.length > 0 && formData.showAddBandMemberInputs === true
                }
                ui={ui}
              />
            </div>
          )}

        {formData.bandMembers.length > 0 && formData.bandMembers.length < MAX_BAND_MEMBERS && (
          <button
            type="button"
            className="edit-album-modal__add-button"
            disabled={editingBandMemberIndex !== null || formData.showAddBandMemberInputs === true}
            onClick={() => onFormDataChange('showAddBandMemberInputs', true)}
          >
            <EditAlbumPlusIcon size={14} />
            {editAlbumAddButtonLabel(ui?.dashboard?.editAlbumModal?.step4?.addButton ?? '+ Add')}
          </button>
        )}
        {step4Err('bandMembers') ? (
          <p id="step4-band-error" className="edit-album-modal__field-error" role="alert">
            {s4inv?.requiredBandMembers}
          </p>
        ) : null}
      </div>

      <div className="edit-album-modal__field">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step4?.sessionMusicians ?? 'Session Musicians'}
        </label>

        {formData.sessionMusicians.length > 0 && (
          <div className="edit-album-modal__list">
            {formData.sessionMusicians.map((musician, index) => (
              <EditableCardField
                key={index}
                data={{
                  title: musician.name,
                  description: musician.role,
                  url: musician.url,
                }}
                isEditing={editingSessionMusicianIndex === index}
                editTitle={sessionMusicianName}
                editDescription={sessionMusicianRole}
                editUrl={sessionMusicianURL}
                onTitleChange={onSessionMusicianNameChange}
                onDescriptionChange={onSessionMusicianRoleChange}
                onUrlChange={onSessionMusicianURLChange}
                onEdit={() => onEditSessionMusician(index)}
                onSave={onAddSessionMusician}
                onCancel={onCancelEditSessionMusician}
                onRemove={() => onRemoveSessionMusician(index)}
                titlePlaceholder="Name"
                descriptionPlaceholder="Role"
                urlPlaceholder="URL (optional)"
                hasUnsavedChanges={
                  editingSessionMusicianIndex === index &&
                  bandMemberEditHasChanges(
                    musician,
                    sessionMusicianName,
                    sessionMusicianRole,
                    sessionMusicianURL
                  )
                }
                ui={ui}
              />
            ))}
          </div>
        )}

        {formData.sessionMusicians.length >= MAX_BAND_MEMBERS && (
          <div className="edit-album-modal__help-text">
            Maximum {MAX_BAND_MEMBERS} session musicians reached
          </div>
        )}

        {(formData.sessionMusicians.length === 0 ||
          formData.showAddSessionMusicianInputs === true) &&
          formData.sessionMusicians.length < MAX_BAND_MEMBERS && (
            <div className="edit-album-modal__list">
              <EditableCardField
                data={{ title: '', description: '', url: '' }}
                isEditing={true}
                editTitle={addSessionMusicianName}
                editDescription={addSessionMusicianRole}
                editUrl={addSessionMusicianURL}
                onTitleChange={onAddSessionMusicianNameChange}
                onDescriptionChange={onAddSessionMusicianRoleChange}
                onUrlChange={onAddSessionMusicianURLChange}
                onEdit={() => {}}
                onSave={onAddSessionMusician}
                onCancel={onCancelEditSessionMusician}
                onRemove={() => {}}
                titlePlaceholder={ui?.dashboard?.editAlbumModal?.step4?.name ?? 'Name'}
                descriptionPlaceholder={ui?.dashboard?.editAlbumModal?.step4?.role ?? 'Role'}
                urlPlaceholder={
                  ui?.dashboard?.editAlbumModal?.step4?.urlOptional ?? 'URL (optional)'
                }
                hasUnsavedChanges={bandMemberEditHasChanges(
                  EMPTY_BAND_MEMBER,
                  addSessionMusicianName,
                  addSessionMusicianRole,
                  addSessionMusicianURL
                )}
                canSave={Boolean(addSessionMusicianName.trim() && addSessionMusicianRole.trim())}
                autoFocusTitle={false}
                ui={ui}
              />
            </div>
          )}

        {formData.sessionMusicians.length > 0 &&
          formData.sessionMusicians.length < MAX_BAND_MEMBERS && (
            <button
              type="button"
              className="edit-album-modal__add-button"
              disabled={
                editingSessionMusicianIndex !== null ||
                formData.showAddSessionMusicianInputs === true
              }
              onClick={() => onFormDataChange('showAddSessionMusicianInputs', true)}
            >
              <EditAlbumPlusIcon size={14} />
              {editAlbumAddButtonLabel(ui?.dashboard?.editAlbumModal?.step4?.addButton ?? '+ Add')}
            </button>
          )}
      </div>

      <div className="edit-album-modal__field" data-step4-field="producer">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step4?.producer ?? 'Producer'}
        </label>

        {formData.producer.length > 0 && (
          <div
            className={`edit-album-modal__list${producerListInvalid ? ' edit-album-modal__list--invalid' : ''}`}
          >
            {formData.producer.map((member, index) => (
              <EditableCardField
                key={index}
                data={{
                  title: member.name,
                  description: member.role,
                  url: member.url,
                }}
                isEditing={editingProducerIndex === index}
                editTitle={producerName}
                editDescription={producerRole}
                editUrl={producerURL}
                onTitleChange={onProducerNameChange}
                onDescriptionChange={onProducerRoleChange}
                onUrlChange={onProducerURLChange}
                onEdit={() => onEditProducer(index)}
                onSave={onAddProducer}
                onCancel={onCancelEditProducer}
                onRemove={() => onRemoveProducer(index)}
                titlePlaceholder="Name"
                descriptionPlaceholder="Role"
                urlPlaceholder="URL (optional)"
                hasUnsavedChanges={
                  editingProducerIndex === index &&
                  bandMemberEditHasChanges(member, producerName, producerRole, producerURL)
                }
                ui={ui}
              />
            ))}
          </div>
        )}

        {formData.producer.length >= MAX_BAND_MEMBERS && (
          <div className="edit-album-modal__help-text">
            Maximum {MAX_BAND_MEMBERS} producers reached
          </div>
        )}

        {(formData.producer.length === 0 || formData.showAddProducerInputs === true) &&
          formData.producer.length < MAX_BAND_MEMBERS && (
            <div
              className={`edit-album-modal__list${producerListInvalid ? ' edit-album-modal__list--invalid' : ''}`}
            >
              <EditableCardField
                data={{ title: '', description: '', url: '' }}
                isEditing={true}
                editTitle={addProducerName}
                editDescription={addProducerRole}
                editUrl={addProducerURL}
                onTitleChange={onAddProducerNameChange}
                onDescriptionChange={onAddProducerRoleChange}
                onUrlChange={onAddProducerURLChange}
                onEdit={() => {}}
                onSave={onAddProducer}
                onCancel={onCancelEditProducer}
                onRemove={() => {}}
                titlePlaceholder={ui?.dashboard?.editAlbumModal?.step4?.name ?? 'Name'}
                descriptionPlaceholder={ui?.dashboard?.editAlbumModal?.step4?.role ?? 'Role'}
                urlPlaceholder={
                  ui?.dashboard?.editAlbumModal?.step4?.urlOptional ?? 'URL (optional)'
                }
                hasUnsavedChanges={bandMemberEditHasChanges(
                  EMPTY_BAND_MEMBER,
                  addProducerName,
                  addProducerRole,
                  addProducerURL
                )}
                canSave={Boolean(addProducerName.trim() && addProducerRole.trim())}
                autoFocusTitle={
                  formData.producer.length > 0 && formData.showAddProducerInputs === true
                }
                ui={ui}
              />
            </div>
          )}

        {formData.producer.length > 0 && formData.producer.length < MAX_BAND_MEMBERS && (
          <button
            type="button"
            className="edit-album-modal__add-button"
            disabled={editingProducerIndex !== null || formData.showAddProducerInputs === true}
            onClick={() => onFormDataChange('showAddProducerInputs', true)}
          >
            <EditAlbumPlusIcon size={14} />
            {editAlbumAddButtonLabel(ui?.dashboard?.editAlbumModal?.step4?.addButton ?? '+ Add')}
          </button>
        )}
        {step4Err('producer') ? (
          <p id="step4-producer-error" className="edit-album-modal__field-error" role="alert">
            {s4inv?.requiredProducer}
          </p>
        ) : null}
      </div>
    </>
  );
}
