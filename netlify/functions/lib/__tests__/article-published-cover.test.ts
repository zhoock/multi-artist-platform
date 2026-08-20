import { describe, expect, test } from '@jest/globals';

import {
  resolveArticleCoverWriteState,
  resolvePublicArticleImg,
  shouldDeleteReplacedArticleCoverKey,
} from '../article-published-cover';

const publishedWithDraftChanges = {
  is_draft: false,
  has_draft_changes: true,
} as const;

describe('resolvePublicArticleImg', () => {
  test('A: published without cover → draft cover B — public placeholder, dashboard B', () => {
    const row = {
      ...publishedWithDraftChanges,
      img: 'article_cover_b.webp',
      published_img: null,
    };

    expect(resolvePublicArticleImg(row, true)).toBe('');
    expect(resolvePublicArticleImg(row, false)).toBe('article_cover_b.webp');
  });

  test('B: published cover A → draft cover B — public A, dashboard B', () => {
    const row = {
      ...publishedWithDraftChanges,
      img: 'article_cover_b.webp',
      published_img: 'article_cover_a.webp',
    };

    expect(resolvePublicArticleImg(row, true)).toBe('article_cover_a.webp');
    expect(resolvePublicArticleImg(row, false)).toBe('article_cover_b.webp');
  });

  test('C: published cover A → delete cover → Save as Draft — public A, dashboard placeholder', () => {
    const row = {
      ...publishedWithDraftChanges,
      img: null,
      published_img: 'article_cover_a.webp',
    };

    expect(resolvePublicArticleImg(row, true)).toBe('article_cover_a.webp');
    expect(resolvePublicArticleImg(row, false)).toBe('');
  });

  test('D: publish draft B — public B, dashboard B', () => {
    const row = {
      is_draft: false,
      has_draft_changes: false,
      img: 'article_cover_b.webp',
      published_img: 'article_cover_b.webp',
    };

    expect(resolvePublicArticleImg(row, true)).toBe('article_cover_b.webp');
    expect(resolvePublicArticleImg(row, false)).toBe('article_cover_b.webp');
  });

  test('E: published cover A → delete cover → Publish — public placeholder, dashboard placeholder', () => {
    const row = {
      is_draft: false,
      has_draft_changes: false,
      img: null,
      published_img: null,
    };

    expect(resolvePublicArticleImg(row, true)).toBe('');
    expect(resolvePublicArticleImg(row, false)).toBe('');
  });

  test('F: published cover A → draft cover B → Discard — public A, dashboard A', () => {
    const row = {
      is_draft: false,
      has_draft_changes: false,
      img: 'article_cover_a.webp',
      published_img: 'article_cover_a.webp',
    };

    expect(resolvePublicArticleImg(row, true)).toBe('article_cover_a.webp');
    expect(resolvePublicArticleImg(row, false)).toBe('article_cover_a.webp');
  });

  test('never uses draft img when published_img is null on public snapshot path', () => {
    expect(
      resolvePublicArticleImg(
        {
          img: 'article_cover_draft.webp',
          published_img: null,
          is_draft: false,
          has_draft_changes: true,
        },
        true
      )
    ).toBe('');
  });

  test('never-published row on public path returns empty published snapshot', () => {
    expect(
      resolvePublicArticleImg(
        {
          img: 'article_cover_draft.webp',
          published_img: null,
          is_draft: true,
          has_draft_changes: false,
        },
        true
      )
    ).toBe('');
  });

  test('published without draft changes serves published_img only', () => {
    expect(
      resolvePublicArticleImg(
        {
          img: 'article_cover_stale.webp',
          published_img: 'article_cover_live.webp',
          is_draft: false,
          has_draft_changes: false,
        },
        true
      )
    ).toBe('article_cover_live.webp');
  });
});

describe('shouldDeleteReplacedArticleCoverKey', () => {
  test('does not delete keys still referenced by the public snapshot', () => {
    expect(
      shouldDeleteReplacedArticleCoverKey('article_cover_public.webp', 'article_cover_public.webp')
    ).toBe(false);
  });

  test('deletes replaced draft-only keys', () => {
    expect(
      shouldDeleteReplacedArticleCoverKey('article_cover_draft.webp', 'article_cover_public.webp')
    ).toBe(true);
  });
});

describe('resolveArticleCoverWriteState', () => {
  test('save draft on published article keeps published_img frozen', () => {
    expect(
      resolveArticleCoverWriteState({
        curIsDraft: false,
        curHasDraftChanges: false,
        curImg: 'article_cover_a.webp',
        curPublishedImg: 'article_cover_a.webp',
        isExplicitPublish: false,
        isDraftRequest: false,
        hasWorkingPatch: true,
        requestedImg: 'article_cover_b.webp',
      })
    ).toEqual({
      img: 'article_cover_b.webp',
      publishedImg: 'article_cover_a.webp',
      hasDraftChanges: true,
    });
  });

  test('save draft on published article without cover keeps published_img null', () => {
    expect(
      resolveArticleCoverWriteState({
        curIsDraft: false,
        curHasDraftChanges: false,
        curImg: null,
        curPublishedImg: null,
        isExplicitPublish: false,
        isDraftRequest: false,
        hasWorkingPatch: true,
        requestedImg: 'article_cover_b.webp',
      })
    ).toEqual({
      img: 'article_cover_b.webp',
      publishedImg: null,
      hasDraftChanges: true,
    });
  });

  test('publish promotes working img to published_img', () => {
    expect(
      resolveArticleCoverWriteState({
        curIsDraft: false,
        curHasDraftChanges: true,
        curImg: 'article_cover_b.webp',
        curPublishedImg: 'article_cover_a.webp',
        isExplicitPublish: true,
        isDraftRequest: false,
        hasWorkingPatch: true,
        requestedImg: 'article_cover_b.webp',
      })
    ).toEqual({
      img: 'article_cover_b.webp',
      publishedImg: 'article_cover_b.webp',
      hasDraftChanges: false,
    });
  });

  test('never-published draft keeps published_img null', () => {
    expect(
      resolveArticleCoverWriteState({
        curIsDraft: true,
        curHasDraftChanges: false,
        curImg: 'article_cover_draft.webp',
        curPublishedImg: null,
        isExplicitPublish: false,
        isDraftRequest: true,
        hasWorkingPatch: true,
        requestedImg: 'article_cover_new.webp',
      })
    ).toEqual({
      img: 'article_cover_new.webp',
      publishedImg: null,
      hasDraftChanges: false,
    });
  });
});
