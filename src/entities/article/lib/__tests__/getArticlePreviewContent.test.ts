import type { IArticles } from '@models';

import { getArticlePreviewContent } from '../getArticlePreviewContent';

describe('getArticlePreviewContent', () => {
  it('returns markdown from paragraph blocks and skips headings', () => {
    const article: IArticles = {
      articleId: 'a1',
      nameArticle: 'Title',
      img: '',
      date: '2026-01-01',
      details: [
        {
          type: 'text',
          blockKind: 'title',
          title: 'Section heading',
        },
        {
          type: 'text',
          blockKind: 'paragraph',
          content: 'Редкий [<u>жук-паразит </u>](вики)обитает в **ЮВ Азии**',
        },
      ],
    };

    const preview = getArticlePreviewContent(article);
    expect(preview).not.toBeNull();
    expect(preview?.markdown).toContain('[<u>жук-паразит </u>](вики)');
    expect(preview?.markdown).toContain('**ЮВ Азии**');
    expect(preview?.truncated).toBe(false);
  });

  it('skips images and dividers', () => {
    const article: IArticles = {
      articleId: 'a2',
      nameArticle: 'Title',
      img: '',
      date: '2026-01-01',
      details: [
        { type: 'image', blockKind: 'image', img: 'cover.jpg' },
        { type: 'text', blockKind: 'divider', content: '---' },
        { type: 'text', blockKind: 'paragraph', content: 'Body **text**' },
      ],
    };

    const preview = getArticlePreviewContent(article);
    expect(preview?.markdown).toBe('Body **text**');
  });

  it('truncates long preview by plain-text length', () => {
    const longBody = `${'word '.repeat(40)}**end**`;
    const article: IArticles = {
      articleId: 'a3',
      nameArticle: 'Title',
      img: '',
      date: '2026-01-01',
      details: [{ type: 'text', blockKind: 'paragraph', content: longBody }],
    };

    const preview = getArticlePreviewContent(article, 50);
    expect(preview).not.toBeNull();
    expect(preview?.truncated).toBe(true);
    expect(preview!.markdown.length).toBeLessThan(longBody.length);
  });
});
