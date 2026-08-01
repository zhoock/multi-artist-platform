/**
 * Canonical stem categories for Dashboard manifest JSON and Netlify read path.
 */

export const STEM_CATEGORIES = [
  'drums',
  'bass',
  'guitar',
  'vocal',
  'piano',
  'strings',
  'synth',
  'percussion',
  'other',
] as const;

export type StemCategory = (typeof STEM_CATEGORIES)[number];

const STEM_CATEGORY_SET: ReadonlySet<string> = new Set(STEM_CATEGORIES);

export function isStemCategory(value: unknown): value is StemCategory {
  return typeof value === 'string' && STEM_CATEGORY_SET.has(value);
}

export function normalizeStemCategory(raw: string): StemCategory | null {
  const trimmed = raw.trim();
  return isStemCategory(trimmed) ? trimmed : null;
}
