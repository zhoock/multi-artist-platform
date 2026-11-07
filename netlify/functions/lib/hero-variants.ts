/**
 * Single source of truth for artist hero (header) responsive images in Storage.
 *
 * Must stay in sync with:
 * - `src/shared/lib/artistHeroHeaderImages.ts` — `HERO_COVER_VARIANT_WIDTHS`, srcset derivation
 * - `generateHeroImageVariants` in `./image-processor.ts` — Sharp output
 * - `upload-file.ts` — upload all keys below before returning success
 */

/** Logical widths in px (resize long edge; height follows source aspect ratio). */
export const HERO_VARIANT_WIDTHS = [896, 1280, 1920] as const;

export type HeroVariantWidth = (typeof HERO_VARIANT_WIDTHS)[number];

/** One derived file per (width × format). AVIF intentionally omitted (WebP + JPEG only). */
export const HERO_VARIANT_FORMATS = ['webp', 'jpg'] as const;

export type HeroVariantFormat = (typeof HERO_VARIANT_FORMATS)[number];

export const HERO_VARIANT_SUFFIXES: readonly string[] = HERO_VARIANT_WIDTHS.flatMap((w) =>
  HERO_VARIANT_FORMATS.map((fmt) => `-${w}.${fmt}`)
);

/** Sharp quality per format (matches previous inline values). */
export const HERO_SHARP_QUALITY: Record<HeroVariantFormat, number> = {
  webp: 85,
  jpg: 85,
};

export const EXPECTED_HERO_VARIANT_FILE_COUNT = HERO_VARIANT_SUFFIXES.length;

/**
 * Relative object names under `users/{userId}/hero/` for one upload (`baseName` = e.g. `hero-abc123`).
 */
export function heroVariantFileNamesForBaseName(baseName: string): string[] {
  return HERO_VARIANT_SUFFIXES.map((suffix) => `${baseName}${suffix}`);
}

/**
 * Canonical DB/API pointer: largest JPEG (matches `upload-file` success `data.url`).
 */
export function heroCanonicalStorageFileName(baseName: string): string {
  return `${baseName}-1920.jpg`;
}
