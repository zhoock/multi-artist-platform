// src/pages/UserDashboard/components/steps/EditAlbumModalStep1.tsx
import { DashboardSpinner } from '@shared/ui/dashboard';
import type { AlbumFormData } from '../modals/album/EditAlbumModal.types';
import { formatDateInput } from '../modals/album/EditAlbumModal.utils';

interface EditAlbumModalStep1Props {
  formData: AlbumFormData;
  onFormDataChange: (field: keyof AlbumFormData, value: string | boolean | File | null) => void;
  albumArtPreview: string | null;
  dragActive: boolean;
  uploadProgress: number;
  uploadStatus: 'idle' | 'uploading' | 'uploaded' | 'error';
  uploadError: string | null;
  coverDraftKey: string | null;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrag: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  formatFileSize: (bytes: number) => string;
}

export function EditAlbumModalStep1({
  formData,
  onFormDataChange,
  albumArtPreview,
  dragActive,
  uploadProgress,
  uploadStatus,
  uploadError,
  coverDraftKey,
  onFileInput,
  onDrag,
  onDrop,
  formatFileSize,
}: EditAlbumModalStep1Props) {
  const showPriceFields = formData.allowDownloadSale !== 'no';
  const showPreorderDate = formData.allowDownloadSale === 'preorder';

  return (
    <>
      <div className="edit-album-modal__divider" />

      <div className="edit-album-modal__field">
        <label htmlFor="album-title" className="edit-album-modal__label">
          Album title
        </label>
        <input
          id="album-title"
          name="album-title"
          type="text"
          autoComplete="off"
          className="edit-album-modal__input"
          required
          value={formData.title ?? ''}
          onChange={(e) => onFormDataChange('title', e.target.value)}
        />
      </div>

      <div className="edit-album-modal__field">
        <label htmlFor="release-date" className="edit-album-modal__label">
          Release date
        </label>
        <input
          id="release-date"
          name="release-date"
          type="text"
          autoComplete="off"
          className="edit-album-modal__input"
          placeholder="DD/MM/YYYY"
          maxLength={10}
          required
          value={formData.releaseDate ?? ''}
          onChange={(e) => {
            const formatted = formatDateInput(e.target.value);
            onFormDataChange('releaseDate', formatted);
          }}
          onBlur={(e) => {
            // При потере фокуса валидируем дату и при необходимости корректируем формат
            const value = e.target.value.trim();
            if (value && value.length === 10) {
              // Проверяем, что формат правильный DD/MM/YYYY
              const parts = value.split('/');
              if (parts.length === 3) {
                const [day, month, year] = parts.map((p) => parseInt(p, 10));
                // Проверяем валидность даты
                if (
                  day >= 1 &&
                  day <= 31 &&
                  month >= 1 &&
                  month <= 12 &&
                  year >= 1900 &&
                  year <= 2100
                ) {
                  const date = new Date(year, month - 1, day);
                  if (
                    date.getDate() === day &&
                    date.getMonth() === month - 1 &&
                    date.getFullYear() === year
                  ) {
                    // Дата валидна, форматируем обратно для отображения
                    const formatted = formatDateInput(value);
                    onFormDataChange('releaseDate', formatted);
                  }
                }
              }
            }
          }}
        />
      </div>

      <div className="edit-album-modal__field">
        <label htmlFor="upc-ean" className="edit-album-modal__label">
          UPC / EAN
        </label>
        <input
          id="upc-ean"
          name="upc-ean"
          type="text"
          autoComplete="off"
          className="edit-album-modal__input"
          placeholder="UPC / EAN"
          required
          value={formData.upcEan ?? ''}
          onChange={(e) => onFormDataChange('upcEan', e.target.value)}
        />
      </div>

      <div className="edit-album-modal__field">
        <label className="edit-album-modal__label">Album art</label>

        <input
          type="file"
          id="album-art-input"
          accept="image/*"
          className="edit-album-modal__file-input"
          onChange={onFileInput}
        />

        {albumArtPreview ? (
          <div className="edit-album-modal__art-wrap">
            <div className="edit-album-modal__art-preview">
              <img
                src={albumArtPreview}
                alt="Album art preview"
                className="edit-album-modal__art-image"
              />
            </div>

            <div className="edit-album-modal__art-actions">
              <div className="edit-album-modal__art-buttons">
                <label htmlFor="album-art-input" className="edit-album-modal__art-button">
                  Replace
                </label>
              </div>

              {formData.albumArt && formData.albumArt instanceof File && (
                <div className="edit-album-modal__art-meta">
                  {formData.albumArt.type || 'Image'} • {formatFileSize(formData.albumArt.size)}
                </div>
              )}

              {uploadStatus === 'uploading' && (
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

              {uploadStatus === 'uploaded' && (
                <div className="edit-album-modal__art-status">
                  <span className="edit-album-modal__art-status-text edit-album-modal__art-status-text--success">
                    Uploaded (draft)
                  </span>
                </div>
              )}

              {uploadStatus === 'error' && uploadError && (
                <div className="edit-album-modal__art-status">
                  <span className="edit-album-modal__art-status-text edit-album-modal__art-status-text--error">
                    Error: {uploadError}
                  </span>
                </div>
              )}

              {!coverDraftKey && albumArtPreview && uploadStatus === 'idle' && (
                <div className="edit-album-modal__art-status">
                  <span className="edit-album-modal__art-status-text">Published cover</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className={`edit-album-modal__dropzone ${dragActive ? 'edit-album-modal__dropzone--active' : ''}`}
            onDragEnter={onDrag}
            onDragLeave={onDrag}
            onDragOver={onDrag}
            onDrop={onDrop}
          >
            <div className="edit-album-modal__dropzone-text">Drag image here</div>
            <label htmlFor="album-art-input" className="edit-album-modal__file-label">
              Choose file
            </label>
          </div>
        )}
      </div>

      <div className="edit-album-modal__field">
        <label htmlFor="description" className="edit-album-modal__label">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          autoComplete="off"
          className="edit-album-modal__textarea"
          placeholder="Short story about the album, credits highlights, genres, etc."
          required
          value={formData.description ?? ''}
          onChange={(e) => onFormDataChange('description', e.target.value)}
        />
      </div>

      <div className="edit-album-modal__field">
        <label className="edit-album-modal__label">Allow download / sale</label>
        <div className="edit-album-modal__help-text">
          Control whether fans can buy/download this album.
        </div>
        <div className="edit-album-modal__radio-group">
          <div className="edit-album-modal__radio-wrapper">
            <input
              type="radio"
              id="download-no"
              name="allow-download-sale"
              className="edit-album-modal__radio"
              checked={formData.allowDownloadSale === 'no'}
              onChange={() => onFormDataChange('allowDownloadSale', 'no')}
            />
            <label htmlFor="download-no" className="edit-album-modal__radio-label">
              No
            </label>
          </div>

          <div className="edit-album-modal__radio-wrapper">
            <input
              type="radio"
              id="download-yes"
              name="allow-download-sale"
              className="edit-album-modal__radio"
              checked={formData.allowDownloadSale === 'yes'}
              onChange={() => onFormDataChange('allowDownloadSale', 'yes')}
            />
            <label htmlFor="download-yes" className="edit-album-modal__radio-label">
              Yes
            </label>
          </div>

          <div className="edit-album-modal__radio-wrapper">
            <input
              type="radio"
              id="download-preorder"
              name="allow-download-sale"
              className="edit-album-modal__radio"
              checked={formData.allowDownloadSale === 'preorder'}
              onChange={() => onFormDataChange('allowDownloadSale', 'preorder')}
            />
            <label htmlFor="download-preorder" className="edit-album-modal__radio-label">
              Accept pre-orders
            </label>
          </div>
        </div>

        {formData.allowDownloadSale === 'preorder' && (
          <div className="edit-album-modal__preorder-help">
            Fans can buy now, download after release date
          </div>
        )}
      </div>

      {showPriceFields && (
        <div className="edit-album-modal__field">
          <label className="edit-album-modal__label">Regular price</label>
          <div className="edit-album-modal__price-group">
            <input
              name="regular-price"
              type="text"
              autoComplete="off"
              className="edit-album-modal__input edit-album-modal__input--price"
              value={formData.regularPrice}
              onChange={(e) => onFormDataChange('regularPrice', e.target.value)}
              disabled={formData.allowDownloadSale === 'no'}
            />
            <span className="edit-album-modal__price-currency" aria-hidden="true">
              ₽
            </span>
          </div>
        </div>
      )}

      {showPreorderDate && (
        <div className="edit-album-modal__field">
          <label htmlFor="preorder-date" className="edit-album-modal__label">
            Pre-order release date
          </label>
          <input
            id="preorder-date"
            name="preorder-date"
            type="text"
            autoComplete="off"
            className="edit-album-modal__input"
            placeholder="DD/MM/YYYY"
            maxLength={10}
            value={formData.preorderReleaseDate}
            onChange={(e) => {
              const formatted = formatDateInput(e.target.value);
              onFormDataChange('preorderReleaseDate', formatted);
            }}
            onBlur={(e) => {
              // При потере фокуса валидируем дату
              const value = e.target.value.trim();
              if (value && value.length === 10) {
                const parts = value.split('/');
                if (parts.length === 3) {
                  const [day, month, year] = parts.map((p) => parseInt(p, 10));
                  if (
                    day >= 1 &&
                    day <= 31 &&
                    month >= 1 &&
                    month <= 12 &&
                    year >= 1900 &&
                    year <= 2100
                  ) {
                    const date = new Date(year, month - 1, day);
                    if (
                      date.getDate() === day &&
                      date.getMonth() === month - 1 &&
                      date.getFullYear() === year
                    ) {
                      const formatted = formatDateInput(value);
                      onFormDataChange('preorderReleaseDate', formatted);
                    }
                  }
                }
              }
            }}
          />
        </div>
      )}
    </>
  );
}
