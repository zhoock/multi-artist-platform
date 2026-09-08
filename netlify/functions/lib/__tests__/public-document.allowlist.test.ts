import { describe, expect, test } from '@jest/globals';

import { classifyDocumentRoute, isStaticAssetPath } from '../public-document/routes';
import { isHelpCategoryValid } from '../public-document/help-catalog';

describe('public-document allowlist without DB', () => {
  test('unknown localized route → unknown class', () => {
    expect(classifyDocumentRoute('/ru/not-in-allowlist', null)).toEqual({ type: 'unknown' });
  });

  test('invalid locale prefix → unknown class', () => {
    expect(classifyDocumentRoute('/xx/help', null)).toEqual({ type: 'unknown' });
  });

  test('dashboard route → fast200', () => {
    expect(classifyDocumentRoute('/dashboard/albums', null)).toEqual({ type: 'fast200' });
  });

  test('missing static asset path detection', () => {
    expect(isStaticAssetPath('/scripts/missing.js')).toBe(true);
  });

  test('valid help category from catalog', () => {
    expect(isHelpCategoryValid('ru', 'publishing')).toBe(true);
    expect(isHelpCategoryValid('ru', 'no-such-category')).toBe(false);
  });
});
