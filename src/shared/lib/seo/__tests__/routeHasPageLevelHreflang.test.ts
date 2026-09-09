import { describe, expect, test } from '@jest/globals';

import { routeHasPageLevelHreflang } from '../routeHasPageLevelHreflang';

describe('routeHasPageLevelHreflang', () => {
  test('home universe keeps App hreflang', () => {
    expect(routeHasPageLevelHreflang('/', false)).toBe(false);
  });

  test('artist hub delegates hreflang to page Helmet', () => {
    expect(routeHasPageLevelHreflang('/', true)).toBe(true);
  });

  test('album, article, help, legal, and stems routes delegate hreflang', () => {
    expect(routeHasPageLevelHreflang('/albums/rubber-soul', false)).toBe(true);
    expect(routeHasPageLevelHreflang('/articles/1', false)).toBe(true);
    expect(routeHasPageLevelHreflang('/help/payments', false)).toBe(true);
    expect(routeHasPageLevelHreflang('/offer', false)).toBe(true);
    expect(routeHasPageLevelHreflang('/privacy', false)).toBe(true);
    expect(routeHasPageLevelHreflang('/stems/mix/abc', false)).toBe(true);
  });
});
