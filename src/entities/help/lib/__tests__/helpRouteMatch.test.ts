import { describe, test, expect } from '@jest/globals';
import { matchPath } from 'react-router-dom';

import {
  HELP_ARTICLE_ROUTE,
  HELP_CATEGORY_ROUTE,
  HELP_HOME_ROUTE,
  isHelpLoaderPath,
  parseHelpArticleParamsFromPath,
  parseHelpCategorySlugFromPath,
} from '../helpRouteMatch';

describe('helpRouteMatch', () => {
  test('isHelpLoaderPath matches help routes with locale prefix', () => {
    expect(isHelpLoaderPath('/en/help')).toBe(true);
    expect(isHelpLoaderPath('/ru/help/payments')).toBe(true);
    expect(isHelpLoaderPath('/en/help/payments/yookassa')).toBe(true);
    expect(isHelpLoaderPath('/en/articles')).toBe(false);
  });

  test('parseHelpCategorySlugFromPath', () => {
    expect(parseHelpCategorySlugFromPath('/en/help/payments')).toBe('payments');
    expect(parseHelpCategorySlugFromPath('/en/help/payments/yookassa')).toBeNull();
  });

  test('parseHelpArticleParamsFromPath', () => {
    expect(parseHelpArticleParamsFromPath('/ru/help/payments/yookassa')).toEqual({
      categorySlug: 'payments',
      articleSlug: 'yookassa',
    });
  });

  test('route constants match react-router patterns', () => {
    expect(matchPath({ path: HELP_HOME_ROUTE, end: true }, '/help')).toBeTruthy();
    expect(matchPath({ path: HELP_CATEGORY_ROUTE, end: true }, '/help/payments')).toBeTruthy();
    expect(
      matchPath({ path: HELP_ARTICLE_ROUTE, end: true }, '/help/payments/yookassa')
    ).toBeTruthy();
  });
});
