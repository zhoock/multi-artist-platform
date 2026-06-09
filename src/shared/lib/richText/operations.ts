import { EMPTY_RICH_TEXT, type InlineMark, type RichText, type RichTextNode } from './types';

function cloneNode(node: RichTextNode): RichTextNode {
  return { text: node.text, marks: [...node.marks] };
}

/** Глубокая копия RichText (nodes и их marks-массивы независимы). */
export function cloneRichText(richText: RichText): RichText {
  return richText.map(cloneNode);
}

function markKey(mark: InlineMark): string {
  switch (mark.type) {
    case 'bold':
      return 'bold';
    case 'italic':
      return 'italic';
    case 'underline':
      return 'underline';
    case 'strike':
      return 'strike';
    case 'code':
      return 'code';
    case 'spoiler':
      return 'spoiler';
    case 'link':
      return `link:${mark.href}`;
    case 'mention':
      return `mention:${mark.id}:${mark.label ?? ''}`;
    case 'hashtag':
      return `hashtag:${mark.tag}`;
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

function markEquals(a: InlineMark, b: InlineMark): boolean {
  return markKey(a) === markKey(b);
}

function marksEqual(a: InlineMark[], b: InlineMark[]): boolean {
  if (a.length !== b.length) return false;
  const keysA = a.map(markKey).sort();
  const keysB = b.map(markKey).sort();
  return keysA.every((key, index) => key === keysB[index]);
}

function getPlainText(richText: RichText): string {
  return richText.map((node) => node.text).join('');
}

function getNodeRanges(richText: RichText): Array<{ start: number; end: number }> {
  let offset = 0;
  return richText.map((node) => {
    const start = offset;
    const end = offset + node.text.length;
    offset = end;
    return { start, end };
  });
}

function clampOffset(offset: number, textLength: number): number {
  return Math.max(0, Math.min(offset, textLength));
}

function splitAtFlatOffset(richText: RichText, offset: number): RichText {
  const textLength = getPlainText(richText).length;
  const clampedOffset = clampOffset(offset, textLength);
  if (clampedOffset === 0 || clampedOffset === textLength) {
    return cloneRichText(richText);
  }

  let nodeOffset = 0;
  for (let index = 0; index < richText.length; index += 1) {
    const node = richText[index];
    const nodeStart = nodeOffset;
    const nodeEnd = nodeOffset + node.text.length;

    if (clampedOffset > nodeStart && clampedOffset < nodeEnd) {
      return splitNode(richText, index, clampedOffset - nodeStart);
    }

    nodeOffset = nodeEnd;
  }

  return cloneRichText(richText);
}

function prepareRange(
  richText: RichText,
  from: number,
  to: number
): { richText: RichText; start: number; end: number } {
  const textLength = getPlainText(richText).length;
  let start = clampOffset(from, textLength);
  let end = clampOffset(to, textLength);

  if (start > end) {
    [start, end] = [end, start];
  }

  let rt = cloneRichText(richText);
  if (end < textLength) {
    rt = splitAtFlatOffset(rt, end);
  }
  if (start > 0 && start < end) {
    rt = splitAtFlatOffset(rt, start);
  }

  return { richText: rt, start, end };
}

function cloneMark(mark: InlineMark): InlineMark {
  switch (mark.type) {
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strike':
    case 'code':
    case 'spoiler':
      return { type: mark.type };
    case 'link':
      return { type: 'link', href: mark.href };
    case 'mention':
      return { type: 'mention', id: mark.id, ...(mark.label ? { label: mark.label } : {}) };
    case 'hashtag':
      return { type: 'hashtag', tag: mark.tag };
    default: {
      const exhaustive: never = mark;
      return exhaustive;
    }
  }
}

/** Объединяет соседние nodes с идентичным набором marks. */
export function mergeAdjacentNodes(richText: RichText): RichText {
  const result: RichTextNode[] = [];

  for (const node of richText) {
    const last = result[result.length - 1];
    if (last && marksEqual(last.marks, node.marks)) {
      last.text += node.text;
    } else {
      result.push(cloneNode(node));
    }
  }

  return result;
}

/** Нормализует RichText: удаляет пустые nodes, сливает соседние, гарантирует non-empty. */
export function normalizeRichText(richText: RichText): RichText {
  return finalizeRichText(richText, true);
}

function finalizeRichText(richText: RichText, merge: boolean): RichText {
  const filtered = richText.filter((node) => node.text.length > 0).map(cloneNode);
  const processed = merge ? mergeAdjacentNodes(filtered) : filtered;

  if (processed.length === 0) {
    return cloneRichText(EMPTY_RICH_TEXT);
  }

  return processed;
}

/** Разбивает node по offset внутри его текста. */
export function splitNode(richText: RichText, nodeIndex: number, offset: number): RichText {
  const node = richText[nodeIndex];
  if (!node || offset <= 0 || offset >= node.text.length) {
    return normalizeRichText(cloneRichText(richText));
  }

  const before: RichTextNode = {
    text: node.text.slice(0, offset),
    marks: [...node.marks],
  };
  const after: RichTextNode = {
    text: node.text.slice(offset),
    marks: [...node.marks],
  };

  const result: RichText = [
    ...richText.slice(0, nodeIndex).map(cloneNode),
    before,
    after,
    ...richText.slice(nodeIndex + 1).map(cloneNode),
  ];

  return finalizeRichText(result, false);
}

/** Переключает mark на диапазоне [from, to) в плоском тексте. */
export function toggleMark(
  richText: RichText,
  from: number,
  to: number,
  mark: InlineMark
): RichText {
  const { richText: rt, start, end } = prepareRange(richText, from, to);
  if (start === end) {
    return normalizeRichText(rt);
  }

  const ranges = getNodeRanges(rt);
  const rangeIndices: number[] = [];

  ranges.forEach(({ start: nodeStart, end: nodeEnd }, index) => {
    if (nodeStart >= start && nodeEnd <= end) {
      rangeIndices.push(index);
    }
  });

  const allHaveMark =
    rangeIndices.length > 0 &&
    rangeIndices.every((index) => rt[index].marks.some((existing) => markEquals(existing, mark)));

  const result = rt.map((node, index) => {
    if (!rangeIndices.includes(index)) {
      return cloneNode(node);
    }

    if (allHaveMark) {
      return {
        text: node.text,
        marks: node.marks.filter((existing) => !markEquals(existing, mark)),
      };
    }

    if (node.marks.some((existing) => markEquals(existing, mark))) {
      return cloneNode(node);
    }

    return {
      text: node.text,
      marks: [...node.marks, cloneMark(mark)],
    };
  });

  return normalizeRichText(result);
}

/** Устанавливает одну link-mark на диапазоне [from, to). */
export function setLink(richText: RichText, from: number, to: number, href: string): RichText {
  const trimmedHref = href.trim();
  if (!trimmedHref) {
    return normalizeRichText(cloneRichText(richText));
  }

  const { richText: rt, start, end } = prepareRange(richText, from, to);
  if (start === end) {
    return normalizeRichText(rt);
  }

  const linkMark: InlineMark = { type: 'link', href: trimmedHref };
  const ranges = getNodeRanges(rt);

  const result = rt.map((node, index) => {
    const { start: nodeStart, end: nodeEnd } = ranges[index];
    if (nodeStart < start || nodeEnd > end) {
      return cloneNode(node);
    }

    const withoutLink = node.marks.filter((mark) => mark.type !== 'link');
    return {
      text: node.text,
      marks: [...withoutLink, linkMark],
    };
  });

  return normalizeRichText(result);
}

/** Плоский текст RichText без markdown-разметки (склейка node.text). */
export function richTextToPlainText(richText: RichText | null | undefined): string {
  if (richText == null) return '';
  return getPlainText(richText);
}

/** true, если в RichText нет видимого текста (после trim). */
export function isRichTextEmpty(richText: RichText | null | undefined): boolean {
  return richTextToPlainText(richText).trim() === '';
}

/**
 * Разрезает RichText по плоскому offset на две независимые части.
 * Обе части нормализованы (пустая часть → EMPTY_RICH_TEXT).
 * Используется при split блока (Enter в середине текста).
 */
export function splitRichTextAt(richText: RichText, offset: number): [RichText, RichText] {
  const textLength = getPlainText(richText).length;
  const clamped = clampOffset(offset, textLength);
  const rt = splitAtFlatOffset(richText, clamped);

  const before: RichTextNode[] = [];
  const after: RichTextNode[] = [];
  let start = 0;
  for (const node of rt) {
    if (start < clamped) {
      before.push(cloneNode(node));
    } else {
      after.push(cloneNode(node));
    }
    start += node.text.length;
  }

  return [normalizeRichText(before), normalizeRichText(after)];
}

/**
 * Вставляет plain-текст в RichText на плоский offset. Вставленный текст
 * наследует marks символа слева (внутри marked-диапазона) либо вставляется
 * без marks (на границе/в начале). Результат нормализован.
 */
export function insertText(richText: RichText, offset: number, text: string): RichText {
  const cloned = cloneRichText(richText);
  if (text === '') {
    return normalizeRichText(cloned);
  }

  const textLength = getPlainText(cloned).length;
  const clamped = clampOffset(offset, textLength);
  const rt = splitAtFlatOffset(cloned, clamped);

  // Наследуем marks node, который заканчивается ровно на offset (символ слева).
  let inheritMarks: InlineMark[] = [];
  let scan = 0;
  for (const node of rt) {
    const nodeEnd = scan + node.text.length;
    if (clamped > scan && clamped <= nodeEnd) {
      inheritMarks = node.marks;
    }
    scan = nodeEnd;
  }

  const result: RichTextNode[] = [];
  let start = 0;
  let inserted = false;
  for (const node of rt) {
    if (!inserted && start === clamped) {
      result.push({ text, marks: inheritMarks.map(cloneMark) });
      inserted = true;
    }
    result.push(cloneNode(node));
    start += node.text.length;
  }
  if (!inserted) {
    result.push({ text, marks: inheritMarks.map(cloneMark) });
  }

  return normalizeRichText(result);
}

/** Удаляет только link-marks на диапазоне [from, to), сохраняя остальные marks. */
export function removeLink(richText: RichText, from: number, to: number): RichText {
  const { richText: rt, start, end } = prepareRange(richText, from, to);
  if (start === end) {
    return normalizeRichText(rt);
  }

  const ranges = getNodeRanges(rt);

  const result = rt.map((node, index) => {
    const { start: nodeStart, end: nodeEnd } = ranges[index];
    if (nodeStart < start || nodeEnd > end) {
      return cloneNode(node);
    }

    return {
      text: node.text,
      marks: node.marks.filter((mark) => mark.type !== 'link'),
    };
  });

  return normalizeRichText(result);
}
