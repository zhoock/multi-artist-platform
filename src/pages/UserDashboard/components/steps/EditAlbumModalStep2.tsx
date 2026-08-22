// src/pages/UserDashboard/components/steps/EditAlbumModalStep2.tsx
import clsx from 'clsx';
import React, { useRef } from 'react';
import type { AlbumFormData } from '../modals/album/EditAlbumModal.types';
import type { IInterface } from '@models';
import { GENRE_OPTIONS, MAX_TAGS } from '../modals/album/EditAlbumModal.constants';
import type { SupportedLang } from '@shared/model/lang';
import { DashboardFormSelectChevron } from '../modals/settings/DashboardFormSelectChevron';
import { DashboardFormSelectDropdown } from '../modals/settings/DashboardFormSelectDropdown';
import {
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
  const genreTriggerRef = useRef<HTMLDivElement>(null);

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

        <div
          className="dashboard-form-select edit-album-modal__genre-select"
          ref={genreDropdownRef}
        >
          <div
            ref={genreTriggerRef}
            className={clsx(
              'dashboard-form-select__trigger',
              genreDropdownOpen && 'dashboard-form-select__trigger--open',
              genreRequired && 'edit-album-modal__genre-select-trigger--invalid'
            )}
            onClick={onGenreDropdownToggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onGenreDropdownToggle();
              }
            }}
            aria-haspopup="listbox"
            aria-expanded={genreDropdownOpen}
            aria-invalid={genreRequired}
            aria-describedby={genreRequired ? 'album-genre-required-error' : undefined}
          >
            {formData.genreCodes.length > 0 ? (
              <div className="edit-album-modal__tags-container edit-album-modal__genre-select-chips">
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
              <span className="dashboard-form-select__value dashboard-form-select__value--placeholder">
                {ui?.dashboard?.editAlbumModal?.step2?.selectGenres ?? 'Select genres...'}
              </span>
            )}

            <DashboardFormSelectChevron open={genreDropdownOpen} />
          </div>

          <DashboardFormSelectDropdown
            isOpen={genreDropdownOpen}
            triggerRef={genreTriggerRef}
            dataAttribute="genre"
          >
            {GENRE_OPTIONS.map((option) => {
              const isSelected = formData.genreCodes.includes(option.code);
              const label = lang === 'ru' ? option.label.ru : option.label.en;

              return (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={clsx(
                    'dashboard-form-select__option',
                    'dashboard-form-select__option--checkbox',
                    isSelected && 'dashboard-form-select__option--selected'
                  )}
                  onClick={() => onGenreToggle(option.code)}
                >
                  <input type="checkbox" tabIndex={-1} readOnly checked={isSelected} aria-hidden />
                  <span>{label}</span>
                </button>
              );
            })}
          </DashboardFormSelectDropdown>
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
