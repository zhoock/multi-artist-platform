// src/shared/lib/richText/markOrder.ts
import type { InlineMark, InlineMarkType } from './types';

/**
 * Канонический порядок вложения marks — единственный источник истины.
 *
 * Чем дальше тип в массиве, тем внешнее wrapper. Порядок marks в самом node
 * семантики не имеет: и renderer (renderRichText), и markdown-сериализатор
 * (richTextToMarkdown) приводят набор marks к этому порядку.
 *
 * italic → bold → underline — типографика (inner → mid);
 * code, strike — поверх типографики;
 * spoiler, mention, hashtag — внешние специальные обёртки;
 * link — всегда самый внешний wrapper.
 */
export const MARK_RENDER_ORDER: InlineMarkType[] = [
  'italic',
  'bold',
  'underline',
  'code',
  'strike',
  'spoiler',
  'mention',
  'hashtag',
  'link',
];

const MARK_ORDER_INDEX = new Map<InlineMarkType, number>(
  MARK_RENDER_ORDER.map((type, index) => [type, index])
);

/** Индекс типа в каноническом порядке (неизвестный тип → 0, самый внутренний). */
export function markRenderOrderIndex(type: InlineMarkType): number {
  return MARK_ORDER_INDEX.get(type) ?? 0;
}

/**
 * Возвращает копию marks, отсортированную от внутреннего к внешнему
 * по MARK_RENDER_ORDER. Не мутирует вход.
 */
export function sortMarksByRenderOrder(marks: InlineMark[]): InlineMark[] {
  return [...marks].sort((a, b) => markRenderOrderIndex(a.type) - markRenderOrderIndex(b.type));
}
