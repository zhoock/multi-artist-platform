import { describe, expect, test } from '@jest/globals';

import {
  applyPublicArticleAccessPolicy,
  previewDetailsOnly,
  redactLockedArticleBodyForPublicApi,
  type PublicArticleData,
} from '../public-article-access';

function sampleArticle(overrides: Partial<PublicArticleData> = {}): PublicArticleData {
  return {
    id: 'uuid-1',
    userId: 'artist-uuid',
    articleId: 'my-article',
    nameArticle: 'Secret Article',
    img: 'cover.jpg',
    date: '2024-06-01',
    description: 'Full article summary that must not leak to unauthorized readers.',
    visibility: 'subscribers_only',
    details: [
      { id: 1, title: 'Section heading' },
      { id: 2, img: 'hero.jpg' },
      { id: 3, content: 'First visible paragraph' },
      { id: 4, content: 'Hidden premium paragraph with sensitive details' },
    ],
    translations: {
      en: {
        nameArticle: 'Secret Article EN',
        description: 'EN summary leak',
        details: [
          { id: 1, content: 'EN lead' },
          { id: 2, content: 'EN hidden body' },
        ],
      },
    },
    ...overrides,
  };
}

describe('previewDetailsOnly', () => {
  test('returns only preview blocks, not locked body', () => {
    const preview = previewDetailsOnly(sampleArticle().details);
    const serialized = JSON.stringify(preview);

    expect(preview).toEqual([
      { id: 2, img: 'hero.jpg' },
      { id: 3, content: 'First visible paragraph' },
    ]);
    expect(serialized).not.toContain('Hidden premium paragraph');
    expect(serialized).not.toContain('Section heading');
  });
});

describe('redactLockedArticleBodyForPublicApi', () => {
  test('strips description and locked details while keeping card metadata', () => {
    const redacted = redactLockedArticleBodyForPublicApi(sampleArticle());

    expect(redacted.articleLocked).toBe(true);
    expect(redacted.nameArticle).toBe('Secret Article');
    expect(redacted.img).toBe('cover.jpg');
    expect(redacted.date).toBe('2024-06-01');
    expect(redacted.visibility).toBe('subscribers_only');
    expect(redacted.description).toBe('');
    expect(JSON.stringify(redacted.details)).not.toContain('Hidden premium paragraph');
    expect(redacted.details).toEqual([
      { id: 2, img: 'hero.jpg' },
      { id: 3, content: 'First visible paragraph' },
    ]);
  });

  test('redacts every locale in translations', () => {
    const redacted = redactLockedArticleBodyForPublicApi(sampleArticle());

    expect(redacted.translations?.en?.description).toBe('');
    expect(redacted.translations?.en?.nameArticle).toBe('Secret Article EN');
    expect(redacted.translations?.en?.details).toEqual([{ id: 1, content: 'EN lead' }]);
    expect(JSON.stringify(redacted.translations)).not.toContain('EN hidden body');
  });
});

describe('applyPublicArticleAccessPolicy', () => {
  test('returns full body for viewers with premium access', () => {
    const article = sampleArticle();
    const [out] = applyPublicArticleAccessPolicy([article], {
      hasPremiumAccess: true,
      monetizationEnabled: true,
    });

    expect(out.articleLocked).toBe(false);
    expect(out.details).toEqual(article.details);
    expect(out.description).toBe(article.description);
  });

  test('returns preview-only body for subscribers_only without premium access', () => {
    const article = sampleArticle();
    const [out] = applyPublicArticleAccessPolicy([article], {
      hasPremiumAccess: false,
      monetizationEnabled: true,
    });

    expect(out.articleLocked).toBe(true);
    expect(out.description).toBe('');
    expect(JSON.stringify(out.details)).not.toContain('Hidden premium paragraph');
    expect(out.details).toHaveLength(2);
  });

  test('treats subscribers_only as public when monetization is disabled', () => {
    const article = sampleArticle();
    const [out] = applyPublicArticleAccessPolicy([article], {
      hasPremiumAccess: false,
      monetizationEnabled: false,
    });

    expect(out.visibility).toBe('public');
    expect(out.articleLocked).toBe(false);
    expect(out.details).toEqual(article.details);
    expect(out.description).toBe(article.description);
  });

  test('filters hidden articles from the public catalog', () => {
    const hidden = sampleArticle({ articleId: 'hidden-one', visibility: 'hidden' });
    const visible = sampleArticle({ articleId: 'visible-one', visibility: 'public' });

    const out = applyPublicArticleAccessPolicy([hidden, visible], {
      hasPremiumAccess: false,
      monetizationEnabled: true,
    });

    expect(out).toHaveLength(1);
    expect(out[0]?.articleId).toBe('visible-one');
  });
});
