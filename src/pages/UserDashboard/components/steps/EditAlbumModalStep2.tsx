// src/pages/UserDashboard/components/steps/EditAlbumModalStep2.tsx
import React from 'react';
import type { AlbumFormData } from '../modals/album/EditAlbumModal.types';
import type { IInterface } from '@models';
import { GENRE_OPTIONS, MAX_TAGS } from '../modals/album/EditAlbumModal.constants';
import type { SupportedLang } from '@shared/model/lang';
import {
  EditAlbumChevronDownIcon,
  EditAlbumChevronUpIcon,
  EditAlbumPlusIcon,
  EditAlbumRemoveIcon,
  editAlbumAddButtonLabel,
} from './EditAlbumStepIcons';

interface EditAlbumModalStep2Props {
  formData: AlbumFormData;
  lang: SupportedLang;
  genreDropdownOpen: boolean;
  genreRequired?: boolean;
  tagInput: string;
  tagError: string;
  genreDropdownRef: React.RefObject<HTMLDivElement>;
  tagInputRef: React.RefObject<HTMLInputElement>;
  onGenreDropdownToggle: () => void;
  onGenreToggle: (genreCode: string) => void;
  onRemoveGenre: (genreCode: string) => void;
  onTagInputChange: (value: string) => void;
  onTagInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  ui?: IInterface;
}

export function EditAlbumModalStep2({
  formData,
  lang,
  genreDropdownOpen,
  genreRequired = false,
  tagInput,
  tagError,
  genreDropdownRef,
  tagInputRef,
  onGenreDropdownToggle,
  onGenreToggle,
  onRemoveGenre,
  onTagInputChange,
  onTagInputKeyDown,
  onAddTag,
  onRemoveTag,
  ui,
}: EditAlbumModalStep2Props) {
  const getGenreLabelByCode = (code: string) => {
    const option = GENRE_OPTIONS.find((item) => item.code === code);
    if (!option) return code;
    return lang === 'ru' ? option.label.ru : option.label.en;
  };
  const step2Ui = ui?.dashboard?.editAlbumModal?.step2 as { genre?: string } | undefined;

  return (
    <>
      <div className="edit-album-modal__divider" />

      <div className="edit-album-modal__field" data-step2-field="genre">
        <label className="edit-album-modal__label">{step2Ui?.genre ?? 'Genre'}</label>

        <div className="edit-album-modal__multiselect" ref={genreDropdownRef}>
          <div
            className={`edit-album-modal__multiselect-input${genreRequired ? ' edit-album-modal__multiselect-input--invalid' : ''}`}
            onClick={onGenreDropdownToggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onGenreDropdownToggle();
              }
            }}
            aria-invalid={genreRequired}
            aria-describedby={genreRequired ? 'album-genre-required-error' : undefined}
          >
            {formData.genreCodes.length > 0 ? (
              <div className="edit-album-modal__tags-container">
                {formData.genreCodes.map((genreCode) => (
                  <span key={genreCode} className="edit-album-modal__tag">
                    {getGenreLabelByCode(genreCode)}
                    <button
                      type="button"
                      className="edit-album-modal__tag-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveGenre(genreCode);
                      }}
                      aria-label={`${ui?.dashboard?.editAlbumModal?.step2?.removeTag ?? 'Remove'} ${getGenreLabelByCode(genreCode)}`}
                    >
                      <EditAlbumRemoveIcon />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="edit-album-modal__multiselect-placeholder">
                {ui?.dashboard?.editAlbumModal?.step2?.selectGenres ?? 'Select genres...'}
              </span>
            )}

            <span className="edit-album-modal__multiselect-arrow">
              {genreDropdownOpen ? <EditAlbumChevronUpIcon /> : <EditAlbumChevronDownIcon />}
            </span>
          </div>

          {genreDropdownOpen && (
            <div className="edit-album-modal__multiselect-dropdown">
              {GENRE_OPTIONS.map((option) => (
                <label key={option.code} className="edit-album-modal__multiselect-option">
                  <input
                    type="checkbox"
                    checked={formData.genreCodes.includes(option.code)}
                    onChange={() => onGenreToggle(option.code)}
                  />
                  <span>{lang === 'ru' ? option.label.ru : option.label.en}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {genreRequired ? (
          <p id="album-genre-required-error" className="edit-album-modal__field-error" role="alert">
            {ui?.dashboard?.editAlbumModal?.step2?.requiredGenre}
          </p>
        ) : null}
      </div>

      <div className="edit-album-modal__field">
        <label className="edit-album-modal__label">
          {ui?.dashboard?.editAlbumModal?.step2?.tags ?? 'Tags'}
        </label>

        <div className="edit-album-modal__tags-input-wrapper">
          {formData.tags.length > 0 && (
            <div className="edit-album-modal__tags-container">
              {formData.tags.map((tag) => (
                <span key={tag} className="edit-album-modal__tag">
                  {tag}
                  <button
                    type="button"
                    className="edit-album-modal__tag-remove"
                    onClick={() => onRemoveTag(tag)}
                    aria-label={`${ui?.dashboard?.editAlbumModal?.step2?.removeTag ?? 'Remove'} ${tag}`}
                  >
                    <EditAlbumRemoveIcon />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="edit-album-modal__tags-input-group">
            <input
              ref={tagInputRef}
              name="tag-input"
              type="text"
              autoComplete="off"
              className="edit-album-modal__input edit-album-modal__input--tags"
              placeholder={
                ui?.dashboard?.editAlbumModal?.step2?.addTagPlaceholder ?? 'Add a tag...'
              }
              value={tagInput}
              onChange={(e) => {
                onTagInputChange(e.target.value);
              }}
              onKeyDown={onTagInputKeyDown}
              disabled={formData.tags.length >= MAX_TAGS}
            />
            <button
              type="button"
              className="edit-album-modal__add-tag-button"
              onClick={onAddTag}
              disabled={formData.tags.length >= MAX_TAGS || !tagInput.trim()}
            >
              <EditAlbumPlusIcon size={14} />
              {editAlbumAddButtonLabel(
                ui?.dashboard?.editAlbumModal?.step2?.addTagButton ?? 'Add +'
              )}
            </button>
          </div>

          {tagError && <div className="edit-album-modal__error">{tagError}</div>}
          {formData.tags.length >= MAX_TAGS && (
            <div className="edit-album-modal__help-text">
              {ui?.dashboard?.editAlbumModal?.step2?.maxTagsReached?.replace(
                '{maxTags}',
                String(MAX_TAGS)
              ) ?? `Maximum ${MAX_TAGS} tags reached`}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
