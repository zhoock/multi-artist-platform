// src/shared/lib/richText/renderRichText.tsx
import { createElement, Fragment, type ReactNode } from 'react';

import { groupRuns, type RenderNode } from './renderTree';
import { sanitizeHref } from './sanitizeHref';
import type { InlineMark, RichText } from './types';

/**
 * Безопасный React-рендер канонической модели RichText.
 *
 * В отличие от renderInlineMarkdown работает напрямую с RichTextNode[], без
 * markdown-парсинга. Не использует dangerouslySetInnerHTML и сторонние движки.
 *
 * Рендер двухфазный: groupRuns() строит вложенное render-дерево из flat-runs
 * (общие внешние marks группируются), затем дерево маппится в ReactNode. Порядок
 * вложения marks задаётся каноническим MARK_RENDER_ORDER (см. markOrder.ts).
 *
 * @see renderTree.ts — построение дерева (pure)
 * @see renderInlineMarkdown — текущий markdown-рендер (будет заменён после миграции)
 */

const LINK_ATTRS = { target: '_blank', rel: 'noopener noreferrer' } as const;

function wrapMark(mark: InlineMark, children: ReactNode, key: string): ReactNode {
  switch (mark.type) {
    case 'italic':
      return createElement('em', { key }, children);
    case 'bold':
      return createElement('strong', { key }, children);
    case 'underline':
      return createElement('u', { key }, children);
    case 'code':
      return createElement('code', { key, className: 'article-inline-code' }, children);
    case 'strike':
      return createElement('s', { key }, children);
    case 'spoiler':
      return createElement(
        'span',
        { key, className: 'article-spoiler', 'data-spoiler': true },
        children
      );
    case 'mention':
      return createElement(
        'span',
        { key, className: 'article-mention', 'data-mention-id': mark.id },
        children
      );
    case 'hashtag':
      return createElement(
        'span',
        { key, className: 'article-hashtag', 'data-hashtag': mark.tag },
        children
      );
    case 'link': {
      const href = sanitizeHref(mark.href);
      // Небезопасная ссылка — снимаем link mark, оставляем содержимое без <a>.
      if (href === null) return createElement(Fragment, { key }, children);
      return createElement('a', { key, href, ...LINK_ATTRS }, children);
    }
    default: {
      const _: never = mark;
      return createElement(Fragment, { key }, children);
    }
  }
}

function renderNodes(nodes: RenderNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.kind === 'text') {
      return createElement(Fragment, { key }, node.text);
    }
    return wrapMark(node.mark, renderNodes(node.children, key), key);
  });
}

/**
 * Главный helper: рендерит RichText в безопасный ReactNode.
 *
 * Пустой вход (null/undefined/[]/только пустые runs) → null. Никаких
 * zero-width символов и плейсхолдеров — empty state решает редактор.
 */
export function renderRichText(richText: RichText | null | undefined): ReactNode {
  if (richText == null || richText.length === 0) return null;

  const tree = groupRuns(richText);
  if (tree.length === 0) return null;

  return createElement(Fragment, null, ...renderNodes(tree, 'rt'));
}
