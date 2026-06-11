import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { getImageUrl } from '@shared/api/albums';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import type { ImageCategory } from '@config/user';
import './style.scss';

interface ImageCarouselProps {
  images: string[];
  alt: string;
  category?: ImageCategory;
  userId?: string;
}

export function ImageCarousel({ images, alt, category = 'articles', userId }: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showCounter, setShowCounter] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isVisibleRef = useRef(false);
  const isScrollingProgrammaticallyRef = useRef(false);

  const goToSlide = (index: number) => {
    if (!containerRef.current) return;
    const slide = containerRef.current.children[index] as HTMLElement;

    // Устанавливаем флаг, что прокрутка программная
    isScrollingProgrammaticallyRef.current = true;
    setCurrentIndex(index);

    slide?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    // Сбрасываем флаг после завершения анимации прокрутки
    setTimeout(() => {
      isScrollingProgrammaticallyRef.current = false;
    }, 500); // Время анимации прокрутки
  };

  const goToPrevious = () => {
    const newIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1;
    goToSlide(newIndex);
    showCounterWithTimeout();
  };

  const goToNext = () => {
    const newIndex = currentIndex === images.length - 1 ? 0 : currentIndex + 1;
    goToSlide(newIndex);
    showCounterWithTimeout();
  };

  // Функция для показа счетчика и сброса таймера скрытия
  const showCounterWithTimeout = useCallback(() => {
    // Показываем счетчик только если карусель видна
    if (isVisibleRef.current) {
      setShowCounter(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      // Скрываем через 4 секунды бездействия
      hideTimeoutRef.current = setTimeout(() => {
        setShowCounter(false);
      }, 4000);
    }
  }, []);

  // Отслеживаем текущий слайд при скролле
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Игнорируем обновление индекса во время программной прокрутки (через кнопки)
      if (!isScrollingProgrammaticallyRef.current) {
        const scrollLeft = container.scrollLeft;
        const slideWidth = container.offsetWidth;
        const newIndex = Math.round(scrollLeft / slideWidth);
        if (newIndex !== currentIndex) {
          setCurrentIndex(newIndex);
        }
      }
      showCounterWithTimeout();
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [currentIndex, showCounterWithTimeout]);

  // Отслеживаем видимость карусели в viewport (как в Instagram)
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const isVisible = entry.isIntersecting;
          isVisibleRef.current = isVisible;

          if (isVisible) {
            // Карусель видна - показываем счетчик
            setShowCounter(true);
            // Скрываем через 4 секунды бездействия
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
            }
            hideTimeoutRef.current = setTimeout(() => {
              setShowCounter(false);
            }, 4000);
          } else {
            // Карусель не видна - скрываем счетчик
            setShowCounter(false);
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
            }
          }
        });
      },
      {
        threshold: 0.1, // Считаем видимым, если видно хотя бы 10%
      }
    );

    observer.observe(carousel);

    return () => {
      observer.disconnect();
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Показываем счетчик при взаимодействии
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = () => {
      showCounterWithTimeout();
    };

    const handleTouchStart = () => {
      showCounterWithTimeout();
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('touchstart', handleTouchStart);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('touchstart', handleTouchStart);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [showCounterWithTimeout]);

  // Клавиатурная навигация
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      container.setAttribute('tabIndex', '0');
    }

    return () => {
      if (container) {
        container.removeEventListener('keydown', handleKeyDown);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (images.length === 0) return null;

  return (
    <div
      ref={carouselRef}
      className={`image-carousel ${showCounter ? 'image-carousel--controls-visible' : ''}`}
      role="region"
      aria-label="Image carousel"
    >
      {/* Счетчик изображений */}
      {images.length > 1 && (
        <div
          className={`image-carousel__counter ${showCounter ? 'image-carousel__counter--visible' : ''}`}
        >
          {currentIndex + 1} / {images.length}
        </div>
      )}

      <div ref={containerRef} className="image-carousel__container">
        {images.map((img, index) => (
          <div key={img} className="image-carousel__slide">
            <img
              src={optionalMediaSrc(
                getImageUrl(img, '.jpg', userId ? { userId, category } : undefined),
                'ImageCarousel:slide',
                { index, category, hasUserId: !!userId }
              )}
              alt={index === 0 ? alt : `${alt} (${index + 1})`}
              loading={index === 0 ? 'lazy' : 'lazy'}
              decoding="async"
            />
          </div>
        ))}
      </div>

      {/* Навигационные стрелки */}
      {images.length > 1 && (
        <>
          {currentIndex > 0 && (
            <button
              type="button"
              className="image-carousel__button image-carousel__button--prev"
              onClick={goToPrevious}
              aria-label="Previous image"
            >
              <ChevronLeftIcon aria-hidden size={24} strokeWidth={2} />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              type="button"
              className="image-carousel__button image-carousel__button--next"
              onClick={goToNext}
              aria-label="Next image"
            >
              <ChevronRightIcon aria-hidden size={24} strokeWidth={2} />
            </button>
          )}
        </>
      )}

      {/* Индикаторы (точки) */}
      {images.length > 1 && (
        <div className="image-carousel__indicators">
          {images.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`image-carousel__indicator ${index === currentIndex ? 'image-carousel__indicator--active' : ''}`}
              onClick={() => goToSlide(index)}
              aria-label={`Go to image ${index + 1}`}
              aria-current={index === currentIndex ? 'true' : 'false'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
