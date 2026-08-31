import type { HeroCoverSources } from '@shared/lib/artistHeroHeaderImages';

/** Default hero upload aspect (1920-wide variants from upload pipeline). */
const HERO_COVER_INTRINSIC_WIDTH = 1920;
const HERO_COVER_INTRINSIC_HEIGHT = 1280;

type HeroCoverImageProps = {
  sources: HeroCoverSources;
};

/**
 * Above-the-fold LCP hero cover — mirrors legacy CSS background positioning via .hero__cover*.
 */
export function HeroCoverImage({ sources }: HeroCoverImageProps) {
  return (
    <div className="hero__cover-layer" aria-hidden="true">
      <picture className="hero__cover">
        {sources.avif ? <source srcSet={sources.avif} type="image/avif" /> : null}
        {sources.webp ? <source srcSet={sources.webp} type="image/webp" /> : null}
        <img
          className="hero__cover-image"
          src={sources.jpg}
          alt=""
          width={HERO_COVER_INTRINSIC_WIDTH}
          height={HERO_COVER_INTRINSIC_HEIGHT}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
    </div>
  );
}
