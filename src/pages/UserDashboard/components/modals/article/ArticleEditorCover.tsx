import clsx from 'clsx';
import { Image as ImageIcon, Trash2 as Trash2Icon, Upload as UploadIcon } from 'lucide-react';
import type { ChangeEvent, DragEvent } from 'react';

import { ArticleCoverImage, ArticleCoverPlaceholder } from '@entities/article';
import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { DashboardIconButton } from '@shared/ui/dashboard';

import type { ArticleCoverUploadState } from './useArticleEditorCover';

type ArticleEditorCoverTexts = {
  label: string;
  uploadPrompt: string;
  uploadFormats: string;
  chooseFile: string;
  replaceCover: string;
  removeCover: string;
  recommendedResolution: string;
  uploading: string;
};

type ArticleEditorCoverProps = {
  articleId: string;
  coverKey: string;
  ownerUserId?: string;
  uploadState: ArticleCoverUploadState;
  disabled?: boolean;
  texts: ArticleEditorCoverTexts;
  onDrag: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
};

export function ArticleEditorCover({
  articleId,
  coverKey,
  ownerUserId,
  uploadState,
  disabled = false,
  texts,
  onDrag,
  onDrop,
  onFileInput,
  onRemove,
}: ArticleEditorCoverProps) {
  const inputId = `edit-article-cover-input-${articleId}`;
  const hasCover = Boolean(coverKey || uploadState.preview);
  const isUploading = uploadState.status === 'uploading';

  return (
    <section className="edit-article-v2__cover" aria-label={texts.label}>
      <span className="edit-article-v2__cover-label">{texts.label}</span>

      <input
        type="file"
        id={inputId}
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
        className="edit-article-v2__cover-file-input"
        onChange={onFileInput}
        disabled={disabled || isUploading}
      />

      {hasCover ? (
        <div className="edit-article-v2__cover-preview-shell">
          <div className="edit-article-v2__cover-preview">
            {uploadState.preview ? (
              <img src={uploadState.preview} alt="" className="edit-article-v2__cover-image" />
            ) : coverKey && ownerUserId ? (
              <ArticleCoverImage
                img={coverKey}
                userId={ownerUserId}
                role="admin"
                alt=""
                className="edit-article-v2__cover-image"
                debugLabel={`EditArticleModal:cover:${articleId}`}
              />
            ) : (
              <ArticleCoverPlaceholder alt="" className="edit-article-v2__cover-image" />
            )}

            {isUploading ? (
              <div className="edit-article-v2__cover-upload-overlay" aria-live="polite">
                <span className="edit-article-v2__cover-upload-overlay-text">
                  {texts.uploading}
                </span>
                <div className="edit-article-v2__cover-progress">
                  <div
                    className="edit-article-v2__cover-progress-bar"
                    style={{ width: `${uploadState.progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <label htmlFor={inputId} className="edit-article-v2__cover-replace">
                <UploadIcon size={16} strokeWidth={2} aria-hidden />
                {texts.replaceCover}
              </label>
            )}
          </div>

          <DashboardIconButton
            className="edit-article-v2__cover-remove"
            destructive
            disabled={disabled || isUploading}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label={texts.removeCover}
          >
            <Trash2Icon {...dashboardActionIconProps()} />
          </DashboardIconButton>
        </div>
      ) : (
        <div
          className={clsx('edit-article-v2__cover-empty', {
            'edit-article-v2__cover-empty--active': uploadState.dragActive,
            'edit-article-v2__cover-empty--uploading': isUploading,
          })}
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
        >
          <ImageIcon className="edit-article-v2__cover-empty-icon" size={28} strokeWidth={1.5} />
          <p className="edit-article-v2__cover-empty-text">
            <span>{texts.uploadPrompt}</span>
            <span className="edit-article-v2__cover-empty-formats">{texts.uploadFormats}</span>
          </p>
          <label
            htmlFor={inputId}
            className={clsx('edit-article-v2__cover-file-label', {
              'edit-article-v2__cover-file-label--disabled': disabled || isUploading,
            })}
          >
            {texts.chooseFile}
          </label>

          {isUploading ? (
            <div className="edit-article-v2__cover-status">
              <div className="edit-article-v2__cover-progress">
                <div
                  className="edit-article-v2__cover-progress-bar"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>
              <span className="edit-article-v2__cover-status-text">{texts.uploading}</span>
            </div>
          ) : null}
        </div>
      )}

      {uploadState.status === 'error' && uploadState.error ? (
        <p className="edit-article-v2__cover-status-text edit-article-v2__cover-status-text--error">
          {uploadState.error}
        </p>
      ) : null}

      <p className="edit-article-v2__cover-hint">{texts.recommendedResolution}</p>
    </section>
  );
}

export function getArticleEditorCoverTexts(
  lang: SupportedLang,
  ui: IInterface | null
): ArticleEditorCoverTexts {
  const en = lang === 'en';
  const d = ui?.dashboard;

  return {
    label: d?.articleCover ?? (en ? 'Article cover' : 'Обложка статьи'),
    uploadPrompt:
      d?.settingsModal?.buttons?.uploadCover ?? (en ? 'Upload cover' : 'Загрузите обложку'),
    uploadFormats: en ? 'JPG, PNG or WebP up to 5 MB' : 'JPG, PNG или WebP до 5 МБ',
    chooseFile: d?.chooseFile ?? (en ? 'Choose file' : 'Выбрать файл'),
    replaceCover: d?.replace ?? (en ? 'Replace cover' : 'Изменить обложку'),
    removeCover: d?.removeAvatarPhoto ?? (en ? 'Remove cover' : 'Удалить обложку'),
    recommendedResolution: en
      ? 'Recommended resolution: 2400×1350 px (16:9)'
      : 'Рекомендуемое разрешение: 2400×1350 px (16:9)',
    uploading: d?.uploading ?? (en ? 'Uploading...' : 'Загрузка...'),
  };
}
