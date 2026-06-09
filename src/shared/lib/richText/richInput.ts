import { insertText, normalizeRichText, splitRichTextAt, richTextToPlainText } from './operations';
import type { RichText } from './types';

export type SelectionOffsets = {
  from: number;
  to: number;
};

/** Удаляет плоский диапазон [from, to) из RichText. */
export function deleteRange(content: RichText, from: number, to: number): RichText {
  if (from === to) return content;
  const before = splitRichTextAt(content, from)[0];
  const after = splitRichTextAt(content, to)[1];
  return normalizeRichText([...before, ...after]);
}

export function lineToRichText(line: string): RichText {
  return normalizeRichText([{ text: line, marks: [] }]);
}

export type EnterSplitResult = {
  before: RichText;
  after: RichText;
  offset: number;
};

/** Разрез блока по Enter на плоском offset (без DOM). */
export function splitAtEnter(content: RichText, offset: number): EnterSplitResult {
  const [before, after] = splitRichTextAt(content, offset);
  return { before, after, offset };
}

export type MultilinePastePlan = {
  leadingContent: RichText;
  middleBlocks: RichText[];
  trailingContent: RichText;
  /** Plain offset каретки в trailing-блоке после вставки */
  focusOffset: number;
};

/**
 * План multiline paste: первая строка остаётся в текущем блоке, средние — новые
 * paragraph, последняя (+ хвост после каретки) — финальный новый paragraph.
 */
export function planMultilinePaste(
  content: RichText,
  text: string,
  selection: SelectionOffsets
): MultilinePastePlan | null {
  const lines = text.split('\n');
  if (lines.length <= 1) return null;

  const base = deleteRange(content, selection.from, selection.to);
  const [partBefore, partAfter] = splitRichTextAt(base, selection.from);
  const beforeLen = richTextToPlainText(partBefore).length;

  const leadingContent = insertText(partBefore, beforeLen, lines[0]);
  const middleBlocks = lines.slice(1, -1).map(lineToRichText);
  const trailingContent = insertText(partAfter, 0, lines[lines.length - 1]);
  const focusOffset = lines[lines.length - 1].length;

  return { leadingContent, middleBlocks, trailingContent, focusOffset };
}

/** Однострочная вставка plain text на выделение. */
export function applyPlainTextInsert(
  content: RichText,
  text: string,
  selection: SelectionOffsets
): { content: RichText; caret: number } {
  const base = deleteRange(content, selection.from, selection.to);
  const next = insertText(base, selection.from, text);
  return { content: next, caret: selection.from + text.length };
}
