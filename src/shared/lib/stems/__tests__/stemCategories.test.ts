import { describe, expect, test } from '@jest/globals';
import { STEM_CATEGORIES, isStemCategory, normalizeStemCategory } from '../stemCategories';
import { STEM_CATEGORIES as entityStemCategories } from '@entities/stem/model/types';

describe('stemCategories', () => {
  test('STEM_CATEGORIES is the manifest contract', () => {
    expect(STEM_CATEGORIES).toEqual([
      'drums',
      'bass',
      'guitar',
      'vocal',
      'piano',
      'strings',
      'synth',
      'percussion',
      'other',
    ]);
  });

  test('entity layer re-exports the same STEM_CATEGORIES array', () => {
    expect(entityStemCategories).toBe(STEM_CATEGORIES);
  });

  test('isStemCategory accepts only canonical values', () => {
    for (const category of STEM_CATEGORIES) {
      expect(isStemCategory(category)).toBe(true);
    }
    expect(isStemCategory('vocals')).toBe(false);
    expect(isStemCategory('banjo')).toBe(false);
  });

  test('normalizeStemCategory matches isStemCategory for trimmed input', () => {
    for (const category of STEM_CATEGORIES) {
      expect(normalizeStemCategory(category)).toBe(category);
      expect(normalizeStemCategory(`  ${category}  `)).toBe(category);
    }
    expect(normalizeStemCategory('vocals')).toBeNull();
    expect(normalizeStemCategory('banjo')).toBeNull();
    expect(normalizeStemCategory('')).toBeNull();
  });
});
