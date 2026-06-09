// src/shared/lib/richText/markdownAdapter.ts
import { markRenderOrderIndex } from './markOrder';
import { normalizeRichText } from './operations';
import { sanitizeHref } from './sanitizeHref';
import { EMPTY_RICH_TEXT, type InlineMark, type RichText, type RichTextNode } from './types';

/**
 * Изолированный bridge между legacy inline-markdown (string) и канонической
 * моделью RichText. Только pure functions, без React, DOM, импортов из pages.
 *
 *   markdown string → markdownToRichText → RichText → renderRichText
 *   RichText → richTextToMarkdown → markdown string
 *
 * Поддерживаемые marks (v1): bold, italic, underline, strike, link.
 * Marks code/spoiler/mention/hashtag зарезервированы в модели, но НЕ
 * сериализуются и НЕ парсятся на этом этапе (см. wrapMarkdown / parseRuns).
 *
 * Markdown-диалект совпадает с renderInlineMarkdown:
 *   **text**     → bold
 *   _text_       → italic
 *   ~~text~~     → strike
 *   [text](url)  → link
 *   <u>text</u>  → underline (нет нативного markdown-синтаксиса; legacy-строки
 *                  его не содержат, поэтому коллизий с существующим контентом нет)
 *
 * Round-trip:
 *   markdown → markdownToRichText → richTextToMarkdown даёт эквивалентный markdown.
 *   Порядок marks канонизируется по MARK_RENDER_ORDER, поэтому повторный проход
 *   стабилен (идемпотентен): f(f(x)) === f(x).
 *
 * Экранирование не поддерживается (как и в renderInlineMarkdown): сбалансированные
 * литеральные разделители в plain-тексте не возникают из распарсенного markdown.
 */

// --- markdown → RichText -----------------------------------------------------

type DelimiterMarkType = 'bold' | 'italic' | 'strike';

type DelimiterRule = {
  marker: string;
  type: DelimiterMarkType;
};

/**
 * Парные разделители. Порядок важен: более длинные маркеры проверяются первыми,
 * чтобы `**` не интерпретировался как два `_`/`*` и `~~` — не как два `~`.
 */
const DELIMITERS: DelimiterRule[] = [
  { marker: '**', type: 'bold' },
  { marker: '~~', type: 'strike' },
  { marker: '_', type: 'italic' },
];

const LINK_PATTERN = /^\[([^\]]*)\]\(([^)\s]+)\)/;
const UNDERLINE_OPEN = '<u>';
const UNDERLINE_CLOSE = '</u>';

function delimiterMark(type: DelimiterMarkType): InlineMark {
  return { type };
}

function findClosing(text: string, from: number, marker: string): number {
  let index = from;
  while (index <= text.length - marker.length) {
    if (text.startsWith(marker, index)) return index;
    index += 1;
  }
  return -1;
}

function matchLink(
  text: string,
  pos: number
): { label: string; href: string; length: number } | null {
  if (text[pos] !== '[') return null;
  const match = LINK_PATTERN.exec(text.slice(pos));
  if (!match) return null;

  const [full, label, rawHref] = match;
  // Небезопасную ссылку не считаем link-mark — оставляем как обычный текст,
  // ровно как делает renderInlineMarkdown. Храним исходный (raw) href: его
  // нормализацию выполняет sanitizeHref на границе рендера (renderRichText).
  if (sanitizeHref(rawHref) === null) return null;

  return { label, href: rawHref, length: full.length };
}

function matchUnderline(text: string, pos: number): { inner: string; length: number } | null {
  if (!text.startsWith(UNDERLINE_OPEN, pos)) return null;
  const contentStart = pos + UNDERLINE_OPEN.length;
  const closing = text.indexOf(UNDERLINE_CLOSE, contentStart);
  // Нет закрытия или пустое содержимое — не разметка.
  if (closing === -1 || closing === contentStart) return null;

  return {
    inner: text.slice(contentStart, closing),
    length: closing + UNDERLINE_CLOSE.length - pos,
  };
}

/**
 * Рекурсивно разбирает строку в плоские runs, накапливая marks по пути вложения.
 * Незакрытые/пустые разделители остаются обычным текстом.
 */
function parseRuns(text: string, marks: InlineMark[]): RichTextNode[] {
  const runs: RichTextNode[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer !== '') {
      runs.push({ text: buffer, marks: [...marks] });
      buffer = '';
    }
  };

  while (i < text.length) {
    const link = matchLink(text, i);
    if (link) {
      flush();
      runs.push(...parseRuns(link.label, [...marks, { type: 'link', href: link.href }]));
      i += link.length;
      continue;
    }

    const underline = matchUnderline(text, i);
    if (underline) {
      flush();
      runs.push(...parseRuns(underline.inner, [...marks, { type: 'underline' }]));
      i += underline.length;
      continue;
    }

    let matchedDelimiter = false;
    for (const { marker, type } of DELIMITERS) {
      if (!text.startsWith(marker, i)) continue;

      const contentStart = i + marker.length;
      const closing = findClosing(text, contentStart, marker);
      // Пустое содержимое (`****`) не считаем разметкой.
      if (closing === -1 || closing === contentStart) continue;

      flush();
      const inner = text.slice(contentStart, closing);
      runs.push(...parseRuns(inner, [...marks, delimiterMark(type)]));
      i = closing + marker.length;
      matchedDelimiter = true;
      break;
    }
    if (matchedDelimiter) continue;

    buffer += text[i];
    i += 1;
  }

  flush();
  return runs;
}

/**
 * Конвертирует legacy inline-markdown в каноническую RichText.
 * Пустой/нулевой вход → EMPTY_RICH_TEXT. Результат нормализован
 * (соседние одинаковые runs слиты, пустые удалены).
 */
export function markdownToRichText(markdown: string | null | undefined): RichText {
  if (markdown == null || markdown === '') {
    return EMPTY_RICH_TEXT.map((node) => ({ text: node.text, marks: [...node.marks] }));
  }
  return normalizeRichText(parseRuns(markdown, []));
}

// --- offset mapping (markdown ↔ plain) ---------------------------------------

/**
 * Заполняет out[absPos] = число литеральных (plain) символов слева от absPos,
 * повторяя логику сопоставления parseRuns (link → underline → delimiters →
 * литерал). Синтаксические символы (маркеры, скобки/url ссылки, теги <u>)
 * не увеличивают plain-счётчик и указывают на текущую длину plain.
 */
function fillPlainMap(text: string, base: number, out: number[], plain: { len: number }): void {
  let i = 0;

  const markSyntax = (fromAbs: number, toAbs: number) => {
    for (let k = fromAbs; k < toAbs; k += 1) {
      out[k] = plain.len;
    }
  };

  while (i < text.length) {
    const abs = base + i;

    const link = matchLink(text, i);
    if (link) {
      out[abs] = plain.len; // '['
      fillPlainMap(link.label, base + i + 1, out, plain);
      markSyntax(base + i + 1 + link.label.length, base + i + link.length); // '](href)'
      i += link.length;
      continue;
    }

    const underline = matchUnderline(text, i);
    if (underline) {
      markSyntax(abs, abs + UNDERLINE_OPEN.length); // '<u>'
      fillPlainMap(underline.inner, base + i + UNDERLINE_OPEN.length, out, plain);
      const innerEndAbs = base + i + UNDERLINE_OPEN.length + underline.inner.length;
      markSyntax(innerEndAbs, base + i + underline.length); // '</u>'
      i += underline.length;
      continue;
    }

    let matchedDelimiter = false;
    for (const { marker } of DELIMITERS) {
      if (!text.startsWith(marker, i)) continue;
      const contentStart = i + marker.length;
      const closing = findClosing(text, contentStart, marker);
      if (closing === -1 || closing === contentStart) continue;

      markSyntax(abs, abs + marker.length); // open marker
      const inner = text.slice(contentStart, closing);
      fillPlainMap(inner, base + contentStart, out, plain);
      markSyntax(base + closing, base + closing + marker.length); // close marker
      i = closing + marker.length;
      matchedDelimiter = true;
      break;
    }
    if (matchedDelimiter) continue;

    out[abs] = plain.len; // литеральный символ
    plain.len += 1;
    i += 1;
  }
}

/** Карта md-offset → plain-offset для строки markdown (длина = md.length + 1). */
function buildMarkdownPlainMap(markdown: string): number[] {
  const out = new Array<number>(markdown.length + 1).fill(0);
  const plain = { len: 0 };
  fillPlainMap(markdown, 0, out, plain);
  out[markdown.length] = plain.len;
  return out;
}

/**
 * Переводит offset в markdown-строке в offset в плоском тексте (как его видит
 * RichText/operations.ts). Нужен для перевода textarea selection (markdown-
 * координаты) в диапазон для toggleMark/setLink/splitRichTextAt.
 */
export function mapMarkdownOffsetToPlain(
  markdown: string | null | undefined,
  mdOffset: number
): number {
  if (markdown == null || markdown === '') return 0;
  const map = buildMarkdownPlainMap(markdown);
  const clamped = Math.max(0, Math.min(mdOffset, markdown.length));
  return map[clamped];
}

/**
 * Обратный перевод: plain-offset → offset в markdown-строке. Возвращает
 * наименьший md-offset с данным числом plain-символов слева (т.е. сразу после
 * нужного литерала, до завершающих маркеров). Нужен для восстановления каретки
 * после format/split/merge, когда буфер ресинкается из richTextToMarkdown.
 */
export function mapPlainOffsetToMarkdown(
  markdown: string | null | undefined,
  plainOffset: number
): number {
  if (markdown == null || markdown === '') return 0;
  const map = buildMarkdownPlainMap(markdown);
  const target = Math.max(0, Math.min(plainOffset, map[markdown.length]));
  for (let i = 0; i < map.length; i += 1) {
    if (map[i] === target) return i;
  }
  return markdown.length;
}

// --- RichText → markdown -----------------------------------------------------

function wrapMarkdown(mark: InlineMark, inner: string): string {
  switch (mark.type) {
    case 'italic':
      return `_${inner}_`;
    case 'bold':
      return `**${inner}**`;
    case 'underline':
      return `${UNDERLINE_OPEN}${inner}${UNDERLINE_CLOSE}`;
    case 'strike':
      return `~~${inner}~~`;
    case 'link':
      return `[${inner}](${mark.href})`;
    // Зарезервированы, но пока не сериализуются: возвращаем содержимое без обёртки.
    case 'code':
    case 'spoiler':
    case 'mention':
    case 'hashtag':
      return inner;
    default: {
      const _: never = mark;
      return inner;
    }
  }
}

/**
 * Идентичность mark для группировки/вложения. Совпадает по сути с markKey
 * из operations: учитывает payload (href/id/tag), чтобы разные ссылки/упоминания
 * не сливались.
 */
function markIdentity(mark: InlineMark): string {
  switch (mark.type) {
    case 'link':
      return `link:${mark.href}`;
    case 'mention':
      return `mention:${mark.id}:${mark.label ?? ''}`;
    case 'hashtag':
      return `hashtag:${mark.tag}`;
    default:
      return mark.type;
  }
}

/** Индекс самой внешней (по MARK_RENDER_ORDER) ещё не применённой mark в run. */
function outermostMarkIndex(marks: InlineMark[], active: Set<string>): number {
  let bestIndex = -1;
  let bestOrder = -1;
  marks.forEach((mark, index) => {
    if (active.has(markIdentity(mark))) return;
    const order = markRenderOrderIndex(mark.type);
    if (order > bestOrder) {
      bestOrder = order;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/**
 * Рекурсивно собирает markdown из плоских runs, восстанавливая вложенность:
 * на каждом шаге выбирается самая внешняя ещё не применённая mark и в одну
 * обёртку группируются все соседние runs, её содержащие. Это инверсия parseRuns,
 * поэтому вложение всегда канонично (по MARK_RENDER_ORDER) независимо от исходного
 * порядка marks в node.
 */
function emit(runs: RichTextNode[], active: Set<string>): string {
  let result = '';
  let i = 0;

  while (i < runs.length) {
    const markIndex = outermostMarkIndex(runs[i].marks, active);

    if (markIndex === -1) {
      result += runs[i].text;
      i += 1;
      continue;
    }

    const mark = runs[i].marks[markIndex];
    const key = markIdentity(mark);

    let j = i;
    while (j < runs.length && runs[j].marks.some((m) => markIdentity(m) === key)) {
      j += 1;
    }

    const nextActive = new Set(active);
    nextActive.add(key);
    result += wrapMarkdown(mark, emit(runs.slice(i, j), nextActive));
    i = j;
  }

  return result;
}

/**
 * Конвертирует RichText обратно в legacy inline-markdown. Пустые runs
 * отбрасываются (никаких голых разделителей); пустой/нулевой вход → ''.
 */
export function richTextToMarkdown(richText: RichText | null | undefined): string {
  if (richText == null || richText.length === 0) return '';
  const runs = richText.filter((node) => node.text !== '');
  if (runs.length === 0) return '';
  return emit(runs, new Set<string>());
}
