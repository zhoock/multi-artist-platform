import {
  ARTICLE_COVER_CATALOG_MAX_WEBP_WIDTH,
  pickArticleCoverWebpWidth,
} from '@shared/lib/articleCoverUrl';

/** Matches `@include breakpoint(tablet)` in article list grid (`width >= 768px`). */
export const ARTICLE_CATALOG_COVER_TABLET_MQ = '(min-width: 768px)';

/**
 * Grid card ≈250px. size=250 → DPR1=-448, DPR2/3=-896 (capped).
 */
export const ARTICLE_CATALOG_COVER_GRID_PROPS = {
  size: 250,
  densities: [1, 2, 3] as const,
  sizes: '(min-width: 768px) 250px, 90vw',
  maxVariantWidth: ARTICLE_COVER_CATALOG_MAX_WEBP_WIDTH,
} as const;

/**
 * Horizontal-scroll card ≈330–360px. size=360 → DPR1=-448, DPR2/3=-896.
 */
export const ARTICLE_CATALOG_COVER_MOBILE_PROPS = {
  size: 360,
  densities: [1, 2, 3] as const,
  sizes: '90vw',
  maxVariantWidth: ARTICLE_COVER_CATALOG_MAX_WEBP_WIDTH,
} as const;

/** Editor preview ≈600px desktop; allows -1344 at 2x when needed. */
export const ARTICLE_EDITOR_COVER_PROPS = {
  size: 600,
  densities: [1, 2] as const,
  sizes: 'min(100vw - 94px, 1000px)',
  maxVariantWidth: 1344,
} as const;

export type ArticleCatalogCoverProps = {
  size: number;
  densities: readonly (1 | 2 | 3)[];
  sizes: string;
  maxVariantWidth: number;
};

export function getCatalogArticleCoverProps(isGridLayout: boolean): ArticleCatalogCoverProps {
  return isGridLayout ? ARTICLE_CATALOG_COVER_GRID_PROPS : ARTICLE_CATALOG_COVER_MOBILE_PROPS;
}

/** Mirrors browser x-descriptor pick for diagnostics/tests. */
export function pickCatalogArticleWebpVariantForDpr(dpr: number, isGridLayout: boolean): number {
  const props = getCatalogArticleCoverProps(isGridLayout);
  const densitySteps = props.densities as Array<1 | 2 | 3>;
  const selectedDensity = densitySteps.reduce<1 | 2 | 3>((best, candidate) => {
    const bestDelta = Math.abs(best - dpr);
    const candidateDelta = Math.abs(candidate - dpr);
    if (candidateDelta < bestDelta) return candidate;
    if (candidateDelta > bestDelta) return best;
    return Math.max(best, candidate) as 1 | 2 | 3;
  }, densitySteps[0]);

  return pickArticleCoverWebpWidth(props.size * selectedDensity, props.maxVariantWidth);
}

/** Editor preview variant pick (allows -1344). */
export function pickEditorArticleWebpVariantForDpr(dpr: number): number {
  const { size, densities, maxVariantWidth } = ARTICLE_EDITOR_COVER_PROPS;
  const densitySteps = [...densities] as Array<1 | 2>;
  const selectedDensity = densitySteps.reduce<1 | 2>((best, candidate) => {
    const bestDelta = Math.abs(best - dpr);
    const candidateDelta = Math.abs(candidate - dpr);
    if (candidateDelta < bestDelta) return candidate;
    if (candidateDelta > bestDelta) return best;
    return Math.max(best, candidate) as 1 | 2;
  }, densitySteps[0]);

  return pickArticleCoverWebpWidth(size * selectedDensity, maxVariantWidth);
}
