import { describe, expect, test } from '@jest/globals';
import {
  EXPECTED_HERO_VARIANT_FILE_COUNT,
  HERO_VARIANT_FORMATS,
  HERO_VARIANT_SUFFIXES,
  HERO_VARIANT_WIDTHS,
  heroVariantFileNamesForBaseName,
} from '../hero-variants';

describe('hero-variants', () => {
  test('expects six WebP + JPEG variants (no AVIF)', () => {
    expect(HERO_VARIANT_FORMATS).toEqual(['webp', 'jpg']);
    expect(HERO_VARIANT_WIDTHS).toEqual([896, 1280, 1920]);
    expect(HERO_VARIANT_SUFFIXES).toHaveLength(6);
    expect(EXPECTED_HERO_VARIANT_FILE_COUNT).toBe(6);
    expect(HERO_VARIANT_SUFFIXES.some((s) => s.includes('.avif'))).toBe(false);
  });

  test('heroVariantFileNamesForBaseName lists six files', () => {
    const base = 'hero-abc';
    const names = heroVariantFileNamesForBaseName(base);
    expect(names).toHaveLength(6);
    expect(names).toContain(`${base}-1920.jpg`);
    expect(names).toContain(`${base}-896.webp`);
    expect(names).not.toContain(`${base}-1920.avif`);
  });
});
