import { describe, expect, test } from '@jest/globals';

import {
  resolveArticleCoverWriteState,
  resolvePublicArticleImg,
  shouldDeleteReplacedArticleCoverKey,
} from '../article-published-cover';

describe('resolvePublicArticleImg', () => {
  test('uses published snapshot while draft changes are pending', () => {
    expect(
      resolvePublicArticleImg(
        {
          img: 'article_cover_draft.webp',
          published_img: 'article_cover_public.webp',
          is_draft: false,
          has_draft_changes: true,
        },
        true
      )
    ).toBe('article_cover_public.webp');
  });

  test('uses live img for dashboard responses', () => {
    expect(
      resolvePublicArticleImg(
        {
          img: 'article_cover_draft.webp',
          published_img: 'article_cover_public.webp',
          is_draft: false,
          has_draft_changes: true,
        },
        false
      )
    ).toBe('article_cover_draft.webp');
  });

  test('never-published draft img is not used on public snapshot path when filtered out', () => {
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
    ).toBe('article_cover_draft.webp');
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
