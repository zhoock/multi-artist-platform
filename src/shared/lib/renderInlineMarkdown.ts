// src/shared/lib/renderInlineMarkdown.ts
import { createElement, Fragment, type ReactNode } from 'react';

/**
 * Безопасный рендеринг inline-markdown для статей.
 *
 * Поддерживается строго тот набор токенов, который умеет создавать редактор статей:
 *   **text**      → <strong>
 *   _text_        → <em>
 *   ~~text~~      → <s>
 *   [text](url)   → <a target="_blank" rel="noopener noreferrer">
 *
 * Намеренно НЕ поддерживаются: произвольный markdown (таблицы, html, code blocks,
 * списки, заголовки и т.д.). Рендеринг идёт через маленький парсер токенов (AST),
 * а не через регулярки в JSX — это позволяет позже добавить новые inline-токены
 * (inline code, spoiler, mention, hashtag), не переписывая рендер.
 *
 * Реализация не использует dangerouslySetInnerHTML и сторонние markdown-движки.
 */

type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'strike'; children: InlineNode[] }
  | { type: 'link'; href: string; children: InlineNode[] };

type DelimiterRule = {
  marker: string;
  type: 'strong' | 'em' | 'strike';
};

/**
 * Парные разделители. Порядок важен: более длинные маркеры проверяются первыми,
 * чтобы `**` не интерпретировался как два `*` (и `~~` — не как два `~`).
 */
const DELIMITERS: DelimiterRule[] = [
  { marker: '**', type: 'strong' },
  { marker: '~~', type: 'strike' },
  { marker: '_', type: 'em' },
];

const LINK_PATTERN = /^\[([^\]]*)\]\(([^)\s]+)\)/;

/**
 * Разрешаем только безопасные схемы ссылок. Всё потенциально опасное
 * (javascript:, data:, vbscript: и т.п.) отбрасываем, чтобы не было XSS.
 * Относительные ссылки и якоря считаются безопасными.
 */
function sanitizeHref(rawHref: string): string | null {
  const href = rawHref.trim();
  if (href === '') return null;

  // Относительные пути, якоря и protocol-relative — безопасны.
  if (/^(\/|#|\.|\?)/.test(href) || /^\/\//.test(href)) {
    return href;
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href);
  if (!schemeMatch) {
    // Нет схемы (например, "example.com/path") — трактуем как внешнюю https-ссылку.
    return `https://${href}`;
  }

  const scheme = schemeMatch[1].toLowerCase();
  const allowed = ['http', 'https', 'mailto', 'tel'];
  return allowed.includes(scheme) ? href : null;
}

function findClosing(text: string, from: number, marker: string): number {
  let index = from;
  while (index <= text.length - marker.length) {
    if (text.startsWith(marker, index)) return index;
    index += 1;
  }
  return -1;
}

function matchLink(text: string, pos: number): { node: InlineNode; length: number } | null {
  if (text[pos] !== '[') return null;
  const match = LINK_PATTERN.exec(text.slice(pos));
  if (!match) return null;

  const [full, label, rawHref] = match;
  const href = sanitizeHref(rawHref);
  // Небезопасная ссылка — оставляем как обычный текст (без разметки).
  if (href === null) return null;

  return {
    node: { type: 'link', href, children: parseInline(label) },
    length: full.length,
  };
}

/**
 * Превращает строку в плоский/вложенный AST inline-токенов.
 * Незакрытые маркеры и неподходящие конструкции остаются обычным текстом,
 * поэтому контент без markdown отображается без изменений.
 */
function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer !== '') {
      nodes.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };

  while (i < text.length) {
    const link = matchLink(text, i);
    if (link) {
      flush();
      nodes.push(link.node);
      i += link.length;
      continue;
    }

    let matchedDelimiter = false;
    for (const { marker, type } of DELIMITERS) {
      if (!text.startsWith(marker, i)) continue;

      const contentStart = i + marker.length;
      const closing = findClosing(text, contentStart, marker);
      // Пустое содержимое (**...** без текста) не считаем разметкой.
      if (closing === -1 || closing === contentStart) continue;

      flush();
      const inner = text.slice(contentStart, closing);
      nodes.push({ type, children: parseInline(inner) });
      i = closing + marker.length;
      matchedDelimiter = true;
      break;
    }
    if (matchedDelimiter) continue;

    buffer += text[i];
    i += 1;
  }

  flush();
  return nodes;
}

function renderNodes(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    const key = index;
    switch (node.type) {
      case 'text':
        return node.value;
      case 'strong':
        return createElement('strong', { key }, ...renderNodes(node.children));
      case 'em':
        return createElement('em', { key }, ...renderNodes(node.children));
      case 'strike':
        return createElement('s', { key }, ...renderNodes(node.children));
      case 'link':
        return createElement(
          'a',
          { key, href: node.href, target: '_blank', rel: 'noopener noreferrer' },
          ...renderNodes(node.children)
        );
      default:
        return null;
    }
  });
}

/**
 * Главный helper: рендерит inline-markdown статьи в безопасный ReactNode.
 * Используется во всех местах отображения контента статей.
 */
export function renderInlineMarkdown(text: string | null | undefined): ReactNode {
  if (text == null || text === '') return text ?? null;
  const nodes = parseInline(text);
  return createElement(Fragment, null, ...renderNodes(nodes));
}
