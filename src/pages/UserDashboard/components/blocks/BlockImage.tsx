// src/pages/UserDashboard/components/blocks/BlockImage.tsx
import React, { useRef, useState } from 'react';
import { getUserImageUrl } from '@shared/api/albums';
import { getUser } from '@shared/lib/auth';
import { uploadArticleBlockImage } from './uploadArticleBlockImage';

interface BlockImageProps {
  imageKey?: string;
  caption?: string;
  onChange: (imageKey: string, caption?: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onConvertToCarousel?: () => void;
  onEnter?: (atEnd: boolean) => void;
}

export function BlockImage({
  imageKey,
  caption,
  onChange,
  onFocus,
  onBlur,
  isSelected,
  onSelect,
  onConvertToCarousel,
  onEnter,
}: BlockImageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [captionValue, setCaptionValue] = useState(caption || '');
  const [showCarouselButton, setShowCarouselButton] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const uploadedKey = await uploadArticleBlockImage(file);
      if (uploadedKey) {
        onChange(uploadedKey, captionValue);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCaption = e.target.value;
    setCaptionValue(newCaption);
    onChange(imageKey || '', newCaption || undefined);
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

  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.();
  };

  return (
    <div
      className="edit-article-v2__block edit-article-v2__block--image"
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {imageKey && imageUrl ? (
        <div
          className="uncollapse edit-article-v2__image-container"
          onClick={handleImageClick}
          onMouseEnter={() => setShowCarouselButton(true)}
          onMouseLeave={() => setShowCarouselButton(false)}
        >
          <img src={imageUrl} alt={caption || ''} />
          {(showCarouselButton || isSelected) && onConvertToCarousel && (
            <button
              type="button"
              className="edit-article-v2__image-convert-to-carousel"
              onClick={(e) => {
                e.stopPropagation();
                onConvertToCarousel();
              }}
            >
              Создать карусель
            </button>
          )}
        </div>
      ) : (
        <div
          className="edit-article-v2__image-empty"
          role="button"
          tabIndex={0}
          aria-label={isUploading ? 'Загрузка изображения' : 'Загрузить изображение'}
          aria-busy={isUploading}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!isUploading) {
                fileInputRef.current?.click();
              }
            }
          }}
        />
      )}
      {imageKey && (
        <input
          type="text"
          className="edit-article-v2__image-caption"
          value={captionValue}
          onChange={handleCaptionChange}
          onKeyDown={handleCaptionKeyDown}
          placeholder="Подпись к изображению (необязательно)"
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  );
}
