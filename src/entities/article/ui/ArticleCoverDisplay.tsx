import { hasArticleCover, type ArticleCoverDisplayRole } from '@shared/lib/articleCoverUrl';

import { ArticleCoverImage } from './ArticleCoverImage';
import { ArticleCoverPlaceholder } from './ArticleCoverPlaceholder';

type ArticleCoverDisplayProps = {
  img: string | null | undefined;
  userId: string | undefined;
  role: ArticleCoverDisplayRole;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'auto' | 'sync';
  debugLabel?: string;
};

/**
 * Article cover for lists/catalog/editor surfaces: standard placeholder when img is null/empty/legacy.
 */
export function ArticleCoverDisplay({
  img,
  userId,
  role,
  alt,
  className,
  loading = 'lazy',
  decoding = 'async',
  debugLabel,
}: ArticleCoverDisplayProps) {
  if (!hasArticleCover(img) || !userId) {
    return (
      <ArticleCoverPlaceholder
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
      />
    );
  }

  return (
    <ArticleCoverImage
      img={img.trim()}
      userId={userId}
      role={role}
      alt={alt}
      className={className}
      loading={loading}
      decoding={decoding}
      debugLabel={debugLabel}
    />
  );
}
