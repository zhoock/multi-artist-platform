import { describe, test, expect } from '@jest/globals';

import { buildHelpArticlePath, buildHelpCategoryPath, buildHelpHomePath } from '../publicPagePaths';

describe('help public page paths', () => {
  test('buildHelpHomePath', () => {
    expect(buildHelpHomePath('en')).toBe('/en/help');
    expect(buildHelpHomePath('ru')).toBe('/ru/help');
  });

  test('buildHelpCategoryPath encodes slug', () => {
    expect(buildHelpCategoryPath('en', 'payments')).toBe('/en/help/payments');
  });

  test('buildHelpArticlePath encodes category and article slugs', () => {
    expect(buildHelpArticlePath('ru', 'payments', 'yookassa')).toBe('/ru/help/payments/yookassa');
  });
});
