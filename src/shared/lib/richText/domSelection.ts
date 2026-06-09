// src/shared/lib/richText/domSelection.ts

/**
 * Мост между DOM Selection и плоскими (plain-text) offset'ами RichText.
 *
 * RichText-движок оперирует плоскими offset'ами в склеенном тексте блока
 * (см. richTextToPlainText / operations.ts). contentEditable же работает с
 * DOM-узлами и Range. Этот модуль переводит одно в другое в обе стороны:
 *
 *   DOM Selection → { from, to }   (getSelectionOffsets)
 *   { from, to }  → DOM Range      (restoreSelection)
 *
 * Предполагается, что содержимое блока — только inline-узлы (text + span/strong/
 * em/u/s/a) без блочных переносов: тогда длина Range.toString() совпадает с
 * длиной плоского текста. Это инвариант renderRichText.
 */

export type SelectionOffsets = {
  from: number;
  to: number;
};

function getPlainTextLength(root: HTMLElement): number {
  return root.textContent?.length ?? 0;
}

/**
 * Плоский offset точки (node, offset) внутри root: длина текста от начала
 * содержимого root до этой точки. node может быть как text-, так и element-узлом
 * (в последнем случае offset — индекс среди дочерних узлов).
 */
export function pointToOffset(root: HTMLElement, node: Node, offset: number): number {
  if (!root.contains(node)) return 0;
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** Текущее выделение как плоские offset'ы относительно root, либо null. */
export function getSelectionOffsets(root: HTMLElement): SelectionOffsets | null {
  const selection = root.ownerDocument.getSelection?.() ?? window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const a = pointToOffset(root, range.startContainer, range.startOffset);
  const b = pointToOffset(root, range.endContainer, range.endOffset);
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

type DomPoint = { node: Node; offset: number };

/** Находит DOM-точку (text node + offset) по плоскому offset внутри root. */
function locate(root: HTMLElement, target: number): DomPoint {
  const clamped = Math.max(0, Math.min(target, getPlainTextLength(root)));

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let accumulated = 0;
  let lastText: Text | null = null;
  let lastNonEmptyText: Text | null = null;

  let current = walker.nextNode() as Text | null;
  while (current) {
    const length = current.data.length;
    lastText = current;
    if (length > 0) {
      lastNonEmptyText = current;
    }

    if (clamped <= accumulated + length) {
      return { node: current, offset: clamped - accumulated };
    }
    accumulated += length;
    current = walker.nextNode() as Text | null;
  }

  const fallback = lastNonEmptyText ?? lastText;
  if (fallback) {
    return { node: fallback, offset: fallback.data.length };
  }
  return { node: root, offset: 0 };
}

/** Восстанавливает выделение [from, to] из плоских offset'ов в DOM root. */
export function restoreSelection(root: HTMLElement, from: number, to: number): void {
  const selection = root.ownerDocument.getSelection?.() ?? window.getSelection();
  if (!selection) return;

  const max = getPlainTextLength(root);
  const startOffset = Math.max(0, Math.min(from, max));
  const endOffset = Math.max(0, Math.min(to, max));

  const start = locate(root, startOffset);
  const end = locate(root, endOffset);

  const range = root.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  selection.removeAllRanges();
  selection.addRange(range);
}
