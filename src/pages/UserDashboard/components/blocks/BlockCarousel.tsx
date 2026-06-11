// src/pages/UserDashboard/components/blocks/BlockCarousel.tsx
import React, { useState } from 'react';
import { getUserImageUrl } from '@shared/api/albums';
import { ArticleCoverPlaceholder } from '@entities/article';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { MIN_CAROUSEL_IMAGES } from '../modals/article/EditArticleModalV2.utils';

interface BlockCarouselProps {
  /** Владелец медиа в Storage (users/{id}/articles/...) */
  mediaOwnerUserId?: string;
  imageKeys: string[];
  caption?: string;
  onChange: (imageKeys: string[], caption?: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onEnter?: (atEnd: boolean) => void;
}

export function BlockCarousel({
  mediaOwnerUserId,
  imageKeys,
  caption,
  onChange,
  onFocus,
  onBlur,
  onDelete,
  isSelected,
  onSelect,
  onEdit,
  onEnter,
}: BlockCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showEditButton, setShowEditButton] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const captionValue = caption || '';

  const handleCarouselClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.();
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : imageKeys.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < imageKeys.length - 1 ? prev + 1 : 0));
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  // Сбрасываем индекс при изменении количества изображений
  React.useEffect(() => {
    if (currentIndex >= imageKeys.length && imageKeys.length > 0) {
      setCurrentIndex(imageKeys.length - 1);
    }
  }, [imageKeys.length, currentIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.(true); // Всегда считаем, что Enter нажато в конце
    }
  };

  if (imageKeys.length === 0) {
    return (
      <div
        className="edit-article-v2__block edit-article-v2__block--carousel"
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div className="edit-article-v2__carousel-empty">
          <button
            type="button"
            className="edit-article-v2__carousel-add-empty"
            onClick={handleEditClick}
          >
            + Добавить фотографии в карусель
          </button>
        </div>
      </div>
    );
  }

  const currentImageUrl = optionalMediaSrc(
    getUserImageUrl(imageKeys[currentIndex], 'articles', '.jpg', undefined, mediaOwnerUserId),
    'BlockCarousel',
    { index: currentIndex, key: imageKeys[currentIndex] }
  );
  const totalImages = imageKeys.length;

  return (
    <div
      className="edit-article-v2__block edit-article-v2__block--carousel"
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      onClick={handleCarouselClick}
      onMouseEnter={() => {
        setShowEditButton(true);
        setShowNav(true);
      }}
      onMouseLeave={() => {
        setShowEditButton(false);
        setShowNav(false);
      }}
    >
      <div className="uncollapse edit-article-v2__carousel-view">
        <div className="edit-article-v2__carousel-image-wrapper">
          {currentImageUrl ? (
            <img src={currentImageUrl} alt={`Image ${currentIndex + 1} of ${totalImages}`} />
          ) : (
            <ArticleCoverPlaceholder alt={`Image ${currentIndex + 1} of ${totalImages}`} />
          )}

          {/* Кнопка "Редактировать карусель" — только при ≥2 сохранённых изображениях */}
          <div className="edit-article-v2__carousel-top-right">
            {(showEditButton || isSelected) &&
              onEdit &&
              imageKeys.length >= MIN_CAROUSEL_IMAGES && (
                <button
                  type="button"
                  className="edit-article-v2__carousel-edit"
                  onClick={handleEditClick}
                >
                  Редактировать карусель
                </button>
              )}
            <div className="edit-article-v2__carousel-badge">
              {currentIndex + 1} из {totalImages}
            </div>
          </div>

          {/* Стрелки навигации */}
          {totalImages > 1 && showNav && (
            <>
              <button
                type="button"
                className="edit-article-v2__carousel-nav edit-article-v2__carousel-nav--prev"
                onClick={handlePrev}
                aria-label="Предыдущее изображение"
              >
                ‹
              </button>
              <button
                type="button"
                className="edit-article-v2__carousel-nav edit-article-v2__carousel-nav--next"
                onClick={handleNext}
                aria-label="Следующее изображение"
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>
      {captionValue && (
        <div className="edit-article-v2__carousel-caption-display">{captionValue}</div>
      )}
    </div>
  );
}
