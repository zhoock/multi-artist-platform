// src/pages/UserDashboard/components/blocks/BlockImage.tsx
import clsx from 'clsx';
import { Plus as PlusIcon } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { getUserImageUrl } from '@shared/api/albums';
import { getUser } from '@shared/lib/auth';
import { EditArticleMediaUploadSpinner } from '../modals/article/EditArticleMediaUploadSpinner';
import type { BlockImagePendingUpload } from './blockImageUpload';
import { uploadArticleBlockImage } from './uploadArticleBlockImage';

interface BlockImageProps {
  imageKey?: string;
  caption?: string;
  pendingUpload?: BlockImagePendingUpload | null;
  onChange: (imageKey: string, caption?: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onConvertToCarousel?: () => void;
  onEnter?: (atEnd: boolean) => void;
  onUploadingChange?: (uploading: boolean) => void;
  onUploadFailed?: () => void;
}

export function BlockImage({
  imageKey,
  caption,
  pendingUpload,
  onChange,
  onFocus,
  onBlur,
  isSelected,
  onSelect,
  onConvertToCarousel,
  onEnter,
  onUploadingChange,
  onUploadFailed,
}: BlockImageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localUpload, setLocalUpload] = useState<BlockImagePendingUpload | null>(null);
  const localPreviewRef = useRef<string | null>(null);
  const captionValue = caption ?? '';

  const clearLocalUpload = () => {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
    setLocalUpload(null);
  };

  useEffect(() => {
    return () => {
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current);
      }
    };
  }, []);

  const activePendingUpload = pendingUpload ?? localUpload;
  const isUploading = activePendingUpload?.status === 'uploading' && !imageKey;
  const uploadPreviewUrl = activePendingUpload?.previewUrl ?? null;

  useEffect(() => {
    onUploadingChange?.(
      Boolean(pendingUpload?.status === 'uploading' || localUpload?.status === 'uploading')
    );
  }, [pendingUpload?.status, localUpload?.status, onUploadingChange]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    clearLocalUpload();
    const previewUrl = URL.createObjectURL(file);
    localPreviewRef.current = previewUrl;
    setLocalUpload({ status: 'uploading', previewUrl });
    onUploadingChange?.(true);

    try {
      const uploadedKey = await uploadArticleBlockImage(file);
      if (uploadedKey) {
        onChange(uploadedKey, captionValue || undefined);
        clearLocalUpload();
      } else {
        onUploadFailed?.();
        clearLocalUpload();
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      onUploadFailed?.();
      clearLocalUpload();
    } finally {
      onUploadingChange?.(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(imageKey || '', e.target.value || undefined);
  };

  const handleCaptionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.(true); // Создаем новый блок при Enter в caption
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Обработка Enter только если фокус на самом блоке (не на input caption)
    if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      onEnter?.(true); // Всегда считаем, что Enter нажато в конце
    }
  };

  const authId = getUser()?.id;
  let imageUrl: string | null = null;
  if (imageKey) {
    if (!authId) {
      console.error('[BUG] BlockImage: no auth userId for image URL');
    } else {
      imageUrl = getUserImageUrl(imageKey, 'articles', '.jpg', undefined, authId);
    }
  }

  const handleImageSelect = () => {
    onSelect?.();
  };

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleImageSelect();
  };

  const handleImageContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    e.stopPropagation();
    handleImageSelect();
  };

  const uploadStatusLabel =
    activePendingUpload?.status === 'error'
      ? 'Ошибка загрузки изображения'
      : 'Загрузка изображения';

  /* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex -- editor block focus shell; image selection is on inner container */
  return (
    <div
      className="edit-article-v2__block edit-article-v2__block--image"
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {imageKey && imageUrl ? (
        <div className="edit-article-v2__media-figure">
          <div
            className={clsx('edit-article-v2__image-container', {
              'edit-article-v2__image-container--controls-visible': isSelected,
            })}
            role="button"
            tabIndex={0}
            onClick={handleImageClick}
            onKeyDown={handleImageContainerKeyDown}
          >
            <img src={imageUrl} alt={captionValue.trim()} />
            <div className="edit-article-v2__image-media-dim" aria-hidden />
            {onConvertToCarousel ? (
              <button
                type="button"
                className="edit-article-v2__image-convert-to-carousel"
                onClick={(e) => {
                  e.stopPropagation();
                  onConvertToCarousel();
                }}
              >
                <PlusIcon size={16} strokeWidth={2} aria-hidden />
                Создать карусель
              </button>
            ) : null}
          </div>
          {!isSelected && captionValue.trim() ? (
            <div className="edit-article-v2__media-caption-display">{captionValue.trim()}</div>
          ) : null}
        </div>
      ) : isUploading || activePendingUpload?.status === 'error' ? (
        <div className="edit-article-v2__media-figure">
          <div
            className={clsx(
              'edit-article-v2__image-container',
              'edit-article-v2__image-container--uploading'
            )}
            aria-busy={isUploading}
            aria-label={uploadStatusLabel}
          >
            {uploadPreviewUrl ? (
              <img src={uploadPreviewUrl} alt="" />
            ) : (
              <div className="edit-article-v2__image-upload-slot" aria-hidden />
            )}
            {isUploading ? (
              <div className="edit-article-v2__image-upload-overlay" aria-live="polite">
                <EditArticleMediaUploadSpinner />
              </div>
            ) : null}
            {activePendingUpload?.status === 'error' && activePendingUpload.errorMessage ? (
              <p className="edit-article-v2__image-upload-error">
                {activePendingUpload.errorMessage}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className="edit-article-v2__image-empty"
          role="button"
          tabIndex={0}
          aria-label="Загрузить изображение"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        />
      )}
      {isSelected && imageKey && (
        <input
          type="text"
          className="edit-article-v2__image-caption"
          value={captionValue}
          onChange={handleCaptionChange}
          onKeyDown={handleCaptionKeyDown}
          placeholder="Подпись к изображению (необязательно)"
          aria-label="Подпись к изображению (необязательно)"
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        disabled={Boolean(pendingUpload?.status === 'uploading')}
      />
    </div>
  );
}
