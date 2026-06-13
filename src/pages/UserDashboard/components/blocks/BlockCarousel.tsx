// src/pages/UserDashboard/components/blocks/BlockCarousel.tsx
import React, { useState } from 'react';
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Pencil as PencilIcon,
} from 'lucide-react';
import type { CarouselImageItem } from '@models';
import { getUserImageUrl } from '@shared/api/albums';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ArticleCoverPlaceholder } from '@entities/article';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { MIN_CAROUSEL_IMAGES } from '../modals/article/EditArticleModalV2.utils';

interface BlockCarouselProps {
  /** Владелец медиа в Storage (users/{id}/articles/...) */
  mediaOwnerUserId?: string;
  images: CarouselImageItem[];
  onChange: (images: CarouselImageItem[]) => void;
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
  images,
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
  const [controlsVisible, setControlsVisible] = useState(false);
  const showEditControl = Boolean(onEdit && images.length >= MIN_CAROUSEL_IMAGES);
  const showControls = controlsVisible || Boolean(isSelected);
  const currentImage = images[currentIndex];
  const currentCaption = currentImage?.caption ?? '';

  const handleCarouselClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.();
  };

  const releaseOverlayFocus = (wrapper: HTMLElement) => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && wrapper.contains(active)) {
      active.blur();
    }
  };

  const handlePrev = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    e.currentTarget.blur();
  };

  const handleNext = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    e.currentTarget.blur();
  };

  const handleWrapperMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    setControlsVisible(false);
    if (!isSelected) {
      releaseOverlayFocus(e.currentTarget);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  const handleCaptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextCaption = e.target.value;
    onChange(
      images.map((item, index) =>
        index === currentIndex ? { ...item, caption: nextCaption || undefined } : item
      )
    );
  };

  const handleCaptionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.(true);
    }
  };

  React.useEffect(() => {
    if (currentIndex >= images.length && images.length > 0) {
      setCurrentIndex(images.length - 1);
    }
  }, [images.length, currentIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      onEnter?.(true);
    }
  };

  if (images.length === 0) {
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
    getUserImageUrl(currentImage.imageKey, 'articles', '.jpg', undefined, mediaOwnerUserId),
    'BlockCarousel',
    { index: currentIndex, key: currentImage.imageKey }
  );
  const totalImages = images.length;
  const imageAlt = currentCaption.trim() || `Image ${currentIndex + 1} of ${totalImages}`;

  return (
    <div
      className="edit-article-v2__block edit-article-v2__block--carousel"
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      onClick={handleCarouselClick}
    >
      <div className="edit-article-v2__media-figure">
        <div className="edit-article-v2__carousel-view">
          <div
            className={[
              'edit-article-v2__carousel-image-wrapper',
              showControls && 'edit-article-v2__carousel-image-wrapper--controls-visible',
              isSelected && 'edit-article-v2__carousel-image-wrapper--selected',
            ]
              .filter(Boolean)
              .join(' ')}
            onMouseEnter={() => setControlsVisible(true)}
            onMouseLeave={handleWrapperMouseLeave}
          >
            {currentImageUrl ? (
              <img src={currentImageUrl} alt={imageAlt} />
            ) : (
              <ArticleCoverPlaceholder alt={imageAlt} />
            )}

            <div className="edit-article-v2__carousel-overlay" aria-hidden={!showControls}>
              <div className="edit-article-v2__carousel-toolbar">
                {showEditControl && (
                  <button
                    type="button"
                    className="edit-article-v2__carousel-edit"
                    onClick={handleEditClick}
                  >
                    <PencilIcon {...dashboardActionIconProps({ size: 16 })} />
                    Редактировать карусель
                  </button>
                )}
                <div className="edit-article-v2__carousel-badge">
                  {currentIndex + 1} из {totalImages}
                </div>
              </div>

              {totalImages > 1 && (
                <>
                  <button
                    type="button"
                    className="edit-article-v2__carousel-nav edit-article-v2__carousel-nav--prev"
                    onClick={handlePrev}
                    aria-label="Предыдущее изображение"
                  >
                    <ChevronLeftIcon {...dashboardActionIconProps({ size: 40 })} />
                  </button>
                  <button
                    type="button"
                    className="edit-article-v2__carousel-nav edit-article-v2__carousel-nav--next"
                    onClick={handleNext}
                    aria-label="Следующее изображение"
                  >
                    <ChevronRightIcon {...dashboardActionIconProps({ size: 40 })} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {!isSelected && currentCaption ? (
          <div className="edit-article-v2__media-caption-display">{currentCaption}</div>
        ) : null}
      </div>

      {isSelected && (
        <input
          type="text"
          className="edit-article-v2__image-caption"
          value={currentCaption}
          onChange={handleCaptionChange}
          onKeyDown={handleCaptionKeyDown}
          placeholder="Подпись к изображению (необязательно)"
          aria-label="Подпись к изображению (необязательно)"
        />
      )}
    </div>
  );
}
