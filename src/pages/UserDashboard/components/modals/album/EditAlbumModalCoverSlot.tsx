import React from 'react';
import { Upload as UploadIcon, Pencil as PencilIcon } from 'lucide-react';
import { DashboardSpinner } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import type { IInterface } from '@models';

export type AlbumCoverSlotUploadStatus = 'idle' | 'uploading' | 'uploaded' | 'error';

export type EditAlbumModalCoverSlotProps = {
  inputId: string;
  title: string;
  requirementLabel: string;
  preview: string | null;
  coverDraftKey: string | null;
  uploadProgress: number;
  uploadStatus: AlbumCoverSlotUploadStatus;
  uploadError: string | null;
  dragActive: boolean;
  showInvalid?: boolean;
  fileMeta?: File | null;
  formatFileSize: (bytes: number) => string;
  ui?: IInterface;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const uploadIconProps = dashboardActionIconProps({ size: 28 });

export function EditAlbumModalCoverSlot({
  inputId,
  title,
  requirementLabel,
  preview,
  coverDraftKey: _coverDraftKey,
  uploadProgress,
  uploadStatus,
  uploadError,
  dragActive,
  showInvalid = false,
  fileMeta: _fileMeta,
  formatFileSize: _formatFileSize,
  ui,
  onDrag,
  onDrop,
  onFileInput,
}: EditAlbumModalCoverSlotProps) {
  const chooseFileLabel = ui?.dashboard?.editAlbumModal?.placeholders?.chooseFile ?? 'Choose file';
  const replaceLabel = ui?.dashboard?.editAlbumModal?.buttons?.replace ?? 'Replace';
  const errorPrefix = ui?.dashboard?.editAlbumModal?.status?.error ?? 'Error';

  const slotSurfaceClass = [
    'edit-album-modal__dropzone',
    'edit-album-modal__dropzone--slot',
    preview ? 'edit-album-modal__dropzone--filled' : 'edit-album-modal__dropzone--empty',
    showInvalid ? 'edit-album-modal__dropzone--invalid' : '',
    !preview && dragActive ? 'edit-album-modal__dropzone--active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const leadIcon = (
    <UploadIcon className="edit-album-modal__dropzone-icon" {...uploadIconProps} aria-hidden />
  );

  return (
    <div
      className={`edit-album-modal__art-slot${showInvalid ? ' edit-album-modal__art-slot--invalid' : ''}`}
    >
      <input
        type="file"
        id={inputId}
        accept="image/*"
        className="edit-album-modal__file-input"
        onChange={onFileInput}
      />

      {preview ? (
        <div className={slotSurfaceClass}>
          <div className="edit-album-modal__cover-layout">
            <div className="edit-album-modal__art-preview">
              <img src={preview} alt="" className="edit-album-modal__art-image" />
            </div>

            <div className="edit-album-modal__cover-info">
              <div
                className="edit-album-modal__slot-grid-lead edit-album-modal__slot-grid-lead--placeholder"
                aria-hidden
              >
                {leadIcon}
              </div>
              <div className="edit-album-modal__art-slot-heading edit-album-modal__art-slot-heading--start">
                <div className="edit-album-modal__dropzone-slot-title">{title}</div>
                <div className="edit-album-modal__dropzone-slot-requirement">
                  {requirementLabel}
                </div>
              </div>
              <div className="edit-album-modal__cover-info-action">
                <label
                  htmlFor={inputId}
                  className="edit-album-modal__art-button edit-album-modal__art-button--icon"
                >
                  <PencilIcon {...dashboardActionIconProps({ size: 14 })} aria-hidden />
                  <span className="edit-album-modal__art-button-text">{replaceLabel}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={slotSurfaceClass}
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
        >
          <div className="edit-album-modal__slot-grid-lead">{leadIcon}</div>

          <div className="edit-album-modal__cover-info edit-album-modal__cover-info--empty">
            <div className="edit-album-modal__art-slot-heading">
              <div className="edit-album-modal__dropzone-slot-title">{title}</div>
              <div className="edit-album-modal__dropzone-slot-requirement">{requirementLabel}</div>
            </div>
            <div className="edit-album-modal__cover-info-action">
              <label htmlFor={inputId} className="edit-album-modal__file-label">
                {chooseFileLabel}
              </label>
            </div>
          </div>
        </div>
      )}

      {preview && uploadStatus === 'uploading' && (
        <div className="edit-album-modal__art-status" aria-busy="true">
          <DashboardSpinner className="edit-album-modal__art-status-spinner" />
          <div className="edit-album-modal__art-progress">
            <div
              className="edit-album-modal__art-progress-bar"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {preview && uploadStatus === 'error' && uploadError && (
        <div className="edit-album-modal__art-status">
          <span className="edit-album-modal__art-status-text edit-album-modal__art-status-text--error">
            {errorPrefix}: {uploadError}
          </span>
        </div>
      )}
    </div>
  );
}
