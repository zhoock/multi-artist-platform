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
 * Символ `\n` в модели рендерится как `<br>` (см. renderRichText). Каждый
 * `<br>` считается одним символом в плоском тексте.
 */

export type SelectionOffsets = {
  from: number;
  to: number;
};

type RichDomSlice =
  | { kind: 'text'; node: Text; length: number }
  | { kind: 'break'; node: HTMLBRElement };

function collectSlices(root: HTMLElement): RichDomSlice[] {
  const slices: RichDomSlice[] = [];

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (text.data.length > 0) {
        slices.push({ kind: 'text', node: text, length: text.data.length });
      }
      return;
    }
    if (node.nodeName === 'BR') {
      // Sentinel после завершающего \n (см. renderRichText) — не считается символом.
      if ((node as HTMLBRElement).hasAttribute('data-rich-trailing')) {
        return;
      }
      slices.push({ kind: 'break', node: node as HTMLBRElement });
      return;
    }
    node.childNodes.forEach(walk);
  };

  walk(root);
  return slices;
}

function sliceLength(slice: RichDomSlice): number {
  return slice.kind === 'text' ? slice.length : 1;
}

function getPlainTextLength(root: HTMLElement): number {
  return collectSlices(root).reduce((sum, slice) => sum + sliceLength(slice), 0);
}

function breakParentIndex(br: HTMLBRElement): { parent: Node; index: number } {
  const parent = br.parentNode ?? br;
  return { parent, index: Array.prototype.indexOf.call(parent.childNodes, br) };
}

/**
 * Плоский offset точки (node, offset) внутри root: длина текста от начала
 * содержимого root до этой точки. node может быть как text-, так и element-узлом
 * (в последнем случае offset — индекс среди дочерних узлов).
 */
export function pointToOffset(root: HTMLElement, node: Node, offset: number): number {
  if (!root.contains(node)) return 0;

  let accumulated = 0;
  for (const slice of collectSlices(root)) {
    if (slice.kind === 'text' && node === slice.node) {
      return accumulated + Math.max(0, Math.min(offset, slice.length));
    }

    if (slice.kind === 'break') {
      const { parent, index } = breakParentIndex(slice.node);
      if (node === slice.node) {
        return accumulated + 1;
      }
      if (node === parent) {
        if (offset === index + 1) {
          return accumulated + 1;
        }
        if (offset === index) {
          return accumulated;
        }
      }
    }

    accumulated += sliceLength(slice);
  }

  return getPlainTextLength(root);
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

/** Находит DOM-точку по плоскому offset внутри root. */
function locate(root: HTMLElement, target: number): DomPoint {
  const clamped = Math.max(0, Math.min(target, getPlainTextLength(root)));
  const slices = collectSlices(root);

  let accumulated = 0;
  for (const slice of slices) {
    const len = sliceLength(slice);
    if (clamped <= accumulated + len) {
      if (slice.kind === 'text') {
        return { node: slice.node, offset: clamped - accumulated };
      }
      const { parent, index } = breakParentIndex(slice.node);
      return { node: parent, offset: index + 1 };
    }
    accumulated += len;
  }

  const last = slices[slices.length - 1];
  if (last?.kind === 'text') {
    return { node: last.node, offset: last.length };
  }
  if (last?.kind === 'break') {
    const { parent, index } = breakParentIndex(last.node);
    return { node: parent, offset: index + 1 };
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
