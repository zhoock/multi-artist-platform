import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { getImageUrl } from '@shared/api/albums';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import type { ImageCategory } from '@config/user';
import './style.scss';

export type ImageCarouselSlide = {
  src: string;
  caption?: string;
};

interface ImageCarouselProps {
  slides: ImageCarouselSlide[];
  category?: ImageCategory;
  userId?: string;
}

export function ImageCarousel({ slides, category = 'articles', userId }: ImageCarouselProps) {
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

    isScrollingProgrammaticallyRef.current = true;
    setCurrentIndex(index);

    slide?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    setTimeout(() => {
      isScrollingProgrammaticallyRef.current = false;
    }, 500);
  };

  const goToPrevious = () => {
    const newIndex = currentIndex === 0 ? slides.length - 1 : currentIndex - 1;
    goToSlide(newIndex);
    showCounterWithTimeout();
  };

  const goToNext = () => {
    const newIndex = currentIndex === slides.length - 1 ? 0 : currentIndex + 1;
    goToSlide(newIndex);
    showCounterWithTimeout();
  };

  const showCounterWithTimeout = useCallback(() => {
    if (isVisibleRef.current) {
      setShowCounter(true);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = setTimeout(() => {
        setShowCounter(false);
      }, 4000);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
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

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const isVisible = entry.isIntersecting;
          isVisibleRef.current = isVisible;

          if (isVisible) {
            setShowCounter(true);
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
            }
            hideTimeoutRef.current = setTimeout(() => {
              setShowCounter(false);
            }, 4000);
          } else {
            setShowCounter(false);
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
            }
          }
        });
      },
      {
        threshold: 0.1,
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

  useEffect(() => {
    if (currentIndex >= slides.length && slides.length > 0) {
      setCurrentIndex(slides.length - 1);
    }
  }, [currentIndex, slides.length]);

  if (slides.length === 0) return null;

  return (
    <div
      ref={carouselRef}
      className={`image-carousel ${showCounter ? 'image-carousel--controls-visible' : ''}`}
      role="region"
      aria-label="Image carousel"
    >
      {slides.length > 1 && (
        <div
          className={`image-carousel__counter ${showCounter ? 'image-carousel__counter--visible' : ''}`}
        >
          {currentIndex + 1} / {slides.length}
        </div>
      )}

      <div ref={containerRef} className="image-carousel__container">
        {slides.map((slide, index) => {
          const imageAlt = slide.caption?.trim() || `Image ${index + 1} of ${slides.length}`;
          const slideCaption = slide.caption?.trim();

          return (
            <div key={`${slide.src}-${index}`} className="image-carousel__slide">
              <figure className="image-carousel__figure">
                <img
                  src={optionalMediaSrc(
                    getImageUrl(slide.src, '.jpg', userId ? { userId, category } : undefined),
                    'ImageCarousel:slide',
                    { index, category, hasUserId: !!userId }
                  )}
                  alt={imageAlt}
                  loading="lazy"
                  decoding="async"
                />
                {slideCaption ? (
                  <figcaption className="image-carousel__caption">{slideCaption}</figcaption>
                ) : null}
              </figure>
            </div>
          );
        })}
      </div>

      {slides.length > 1 && (
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
          {currentIndex < slides.length - 1 && (
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

      {slides.length > 1 && (
        <div className="image-carousel__indicators">
          {slides.map((slide, index) => (
            <button
              key={`${slide.src}-${index}-indicator`}
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
