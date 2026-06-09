import type { InlineMark, InlineMarkType, RichText, RichTextNode } from './types';
import { richTextToPlainText } from './operations';

export type MarkRange = {
  from: number;
  to: number;
};

type NormalizedRange = {
  from: number;
  to: number;
};

function normalizeRange(content: RichText, from: number, to: number): NormalizedRange {
  const textLength = richTextToPlainText(content).length;
  let start = Math.max(0, Math.min(from, textLength));
  let end = Math.max(0, Math.min(to, textLength));
  if (start > end) {
    [start, end] = [end, start];
  }
  return { from: start, to: end };
}

function getNodeRanges(
  content: RichText
): Array<{ node: RichTextNode; start: number; end: number }> {
  let offset = 0;
  return content.map((node) => {
    const start = offset;
    const end = offset + node.text.length;
    offset = end;
    return { node, start, end };
  });
}

function nodeOverlapsRange(
  nodeStart: number,
  nodeEnd: number,
  rangeFrom: number,
  rangeTo: number
): boolean {
  if (rangeFrom === rangeTo) {
    // Collapsed caret: inside run, including empty run at offset.
    if (nodeStart === nodeEnd) {
      return rangeFrom === nodeStart;
    }
    return nodeStart <= rangeFrom && rangeFrom < nodeEnd;
  }
  return nodeStart < rangeTo && nodeEnd > rangeFrom;
}

function markTypeOf(mark: InlineMark): InlineMarkType {
  return mark.type;
}

function markTypesInNode(node: RichTextNode): Set<InlineMarkType> {
  return new Set(node.marks.map(markTypeOf));
}

function intersectSets<T>(sets: Set<T>[]): Set<T> {
  if (sets.length === 0) return new Set();
  const [first, ...rest] = sets;
  const result = new Set(first);
  for (const set of rest) {
    for (const value of result) {
      if (!set.has(value)) {
        result.delete(value);
      }
    }
  }
  return result;
}

function linkHrefInNode(node: RichTextNode): string | null {
  const link = node.marks.find(
    (mark): mark is InlineMark & { type: 'link' } => mark.type === 'link'
  );
  return link?.href ?? null;
}

function nodeHasMarkType(
  node: RichTextNode,
  markType: InlineMarkType,
  linkHref?: string | null
): boolean {
  return node.marks.some((mark) => {
    if (mark.type !== markType) return false;
    if (markType === 'link') {
      return linkHref == null || (mark.type === 'link' && mark.href === linkHref);
    }
    return true;
  });
}

/** true, если выделение свёрнуто (каретка без диапазона). */
export function isCollapsedSelection(from: number, to: number): boolean {
  return from === to;
}

/**
 * Пересечение inline-mark типов на диапазоне [from, to) в плоском тексте.
 * Для collapsed selection — marks run'а под кареткой.
 * Пустой диапазон на пустом блоке → пустое множество.
 */
export function getActiveMarks(content: RichText, from: number, to: number): Set<InlineMarkType> {
  const { from: start, to: end } = normalizeRange(content, from, to);
  const ranges = getNodeRanges(content);
  const overlapping = ranges.filter(({ start: nodeStart, end: nodeEnd }) =>
    nodeOverlapsRange(nodeStart, nodeEnd, start, end)
  );

  if (overlapping.length === 0) {
    return new Set();
  }

  const markSets = overlapping.map(({ node }) => markTypesInNode(node));
  const intersection = intersectSets(markSets);

  // link в toolbar считается активным только если href одинаков на всём выделении.
  if (intersection.has('link')) {
    const hrefs = overlapping
      .map(({ node }) => linkHrefInNode(node))
      .filter((href): href is string => href != null);
    const uniqueHrefs = new Set(hrefs);
    if (uniqueHrefs.size !== 1 || hrefs.length !== overlapping.length) {
      intersection.delete('link');
    }
  }

  return intersection;
}

/**
 * href активной ссылки на выделении, если link входит в getActiveMarks;
 * иначе null.
 */
export function getLinkAtSelection(content: RichText, from: number, to: number): string | null {
  const active = getActiveMarks(content, from, to);
  if (!active.has('link')) {
    return null;
  }

  const { from: start, to: end } = normalizeRange(content, from, to);
  const ranges = getNodeRanges(content);
  const overlapping = ranges.filter(({ start: nodeStart, end: nodeEnd }) =>
    nodeOverlapsRange(nodeStart, nodeEnd, start, end)
  );

  const href = linkHrefInNode(overlapping[0]?.node ?? { text: '', marks: [] });
  return href;
}

/**
 * Непрерывный диапазон [from, to) одной mark, содержащий offset.
 * Для link расширяется только в пределах одного href.
 * Если mark отсутствует в точке offset — null.
 */
export function getMarkRange(
  content: RichText,
  offset: number,
  markType: InlineMarkType
): MarkRange | null {
  const textLength = richTextToPlainText(content).length;
  const clamped = Math.max(0, Math.min(offset, textLength));
  const ranges = getNodeRanges(content);

  const atOffset = ranges.find(({ start, end }) => nodeOverlapsRange(start, end, clamped, clamped));
  if (!atOffset) {
    return null;
  }

  const linkHref = markType === 'link' ? linkHrefInNode(atOffset.node) : null;
  if (!nodeHasMarkType(atOffset.node, markType, linkHref)) {
    return null;
  }

  let from = atOffset.start;
  let to = atOffset.end;

  const atIndex = ranges.indexOf(atOffset);
  for (let i = atIndex - 1; i >= 0; i -= 1) {
    const { node, start } = ranges[i];
    if (!nodeHasMarkType(node, markType, linkHref)) break;
    from = start;
  }

  for (let i = atIndex + 1; i < ranges.length; i += 1) {
    const { node, end } = ranges[i];
    if (!nodeHasMarkType(node, markType, linkHref)) break;
    to = end;
  }

  return { from, to };
}
