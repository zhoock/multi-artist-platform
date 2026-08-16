import type { CoverProps } from 'models';

/** Matches Supabase webp variants (see AlbumCover / commit-cover pipeline). */
const SUPA_WEBP_SIZES = [448, 896, 1344] as const;

function pickCeilOrMax(target: number, candidates: readonly number[]) {
  for (const c of candidates) {
    if (c >= target) return c;
  }
  return candidates[candidates.length - 1];
}

/** Matches `@include breakpoint(tablet)` in album list grid (`width >= 768px`). */
export const CATALOG_COVER_TABLET_MQ = '(min-width: 768px)';

/**
 * Grid card ≈250px (minmax(1000px/4)). size=224 → 1x/2x srcset both map to -448.
 */
export const CATALOG_COVER_GRID_PROPS = {
  size: 224,
  densities: [1, 2],
  sizes: '(min-width: 768px) 250px, 90vw',
} as const satisfies Pick<CoverProps, 'size' | 'densities' | 'sizes'>;

/**
 * Horizontal-scroll card ≈330–360px. size=360 → 1x=-448, 2x=-896; no 3x (avoids -1344).
 */
export const CATALOG_COVER_MOBILE_PROPS = {
  size: 360,
  densities: [1, 2],
  sizes: '90vw',
} as const satisfies Pick<CoverProps, 'size' | 'densities' | 'sizes'>;

export function getCatalogAlbumCoverProps(
  isGridLayout: boolean
): Pick<CoverProps, 'size' | 'densities' | 'sizes'> {
  return isGridLayout ? CATALOG_COVER_GRID_PROPS : CATALOG_COVER_MOBILE_PROPS;
}

/** Mirrors browser x-descriptor pick (closest density to DPR) for diagnostics/tests. */
export function pickCatalogWebpVariantForDpr(dpr: number, isGridLayout: boolean): number {
  const { size = 448, densities = [1, 2] } = getCatalogAlbumCoverProps(isGridLayout);
  const densitySteps = densities as Array<1 | 2 | 3>;
  const selectedDensity = densitySteps.reduce<1 | 2 | 3>((best, candidate) => {
    const bestDelta = Math.abs(best - dpr);
    const candidateDelta = Math.abs(candidate - dpr);
    if (candidateDelta < bestDelta) return candidate;
    if (candidateDelta > bestDelta) return best;
    return Math.max(best, candidate) as 1 | 2 | 3;
  }, densitySteps[0]);

  return pickCeilOrMax(size * selectedDensity, SUPA_WEBP_SIZES);
}
