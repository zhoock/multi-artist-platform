import { describe, test, expect } from '@jest/globals';

import type { HelpCatalog } from '@entities/help';

import { buildHelpSitemapEntries } from '../buildHelpSitemapEntries';

describe('buildHelpSitemapEntries', () => {
  test('emits home, category, and nested article URLs for both locales', () => {
    const catalog: HelpCatalog = {
      version: 1,
      categories: [{ slug: 'payments', title: 'Payments', sortOrder: 1 }],
      articles: [
        {
          slug: 'yookassa-setup',
          categorySlug: 'payments',
          title: 'YooKassa setup',
          description: 'Connect YooKassa',
          updatedAt: '2026-01-15',
          sortOrder: 1,
        },
      ],
    };

    const entries = buildHelpSitemapEntries(catalog);
    const paths = entries.map((entry) => entry.path);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/en/help',
        '/ru/help',
        '/en/help/payments',
        '/ru/help/payments',
        '/en/help/payments/yookassa-setup',
        '/ru/help/payments/yookassa-setup',
      ])
    );
    expect(
      entries.find((entry) => entry.path === '/en/help/payments/yookassa-setup')?.lastmod
    ).toBe('2026-01-15');
  });
});
