/**
 * Каноническая node-based модель inline-форматирования для текстовых блоков статей.
 * RichText — последовательность leaf-nodes (как в Slate/Lexical), без markdown в строке
 * и без диапазонов from/to. Существует параллельно текущему Block.text: string;
 * runtime, сериализация и UI пока не используют эти типы.
 *
 * @see operations.ts (будущий) — toggleMark, setLink, insertText, normalizeRuns
 * @see renderRichText.tsx (будущий) — безопасный React-рендер RichText
 */

import type { CarouselImageItem } from '@models';

/** Поддерживаемые inline-марки. Новые типы добавляются в этот union. */
export type InlineMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'strike' }
  | { type: 'link'; href: string }
  | { type: 'code' }
  | { type: 'spoiler' }
  | { type: 'mention'; id: string; label?: string }
  | { type: 'hashtag'; tag: string };

/**
 * Непрерывный фрагмент текста с одинаковым набором inline-марок.
 * Аналог leaf/text node в Slate/Lexical.
 */
export type RichTextNode = {
  text: string;
  marks: InlineMark[];
};

/**
 * Каноническое inline-содержимое текстового блока или элемента списка.
 *
 * Инварианты (для будущего editor engine, не enforce на уровне типов):
 * - runs упорядочены слева направо;
 * - соседние nodes с идентичным набором marks должны быть слиты (normalizeRuns);
 * - text не содержит markdown-синтаксиса (** _ ~~ [](...));
 * - link mark задаёт href; видимый текст ссылки — node.text;
 * - mention/hashtag хранят id/tag в mark, отображаемый текст — node.text;
 * - пустой блок: [{ text: '', marks: [] }], не [] (явный leaf для caret/selection).
 */
export type RichText = RichTextNode[];

export type InlineMarkType = InlineMark['type'];

/** Марки, реализованные в текущем markdown-редакторе (v1). */
export type SupportedInlineMarkType = 'bold' | 'italic' | 'strike' | 'link';

/** Марки, зарезервированные под будущие фичи редактора. */
export type FutureInlineMarkType = Exclude<InlineMarkType, SupportedInlineMarkType>;

/** Пустой текстовый блок: один run с пустой строкой. */
export type EmptyRichText = [{ text: ''; marks: [] }];

/** Текстовые block kinds, которые в будущем хранят content: RichText. */
export type RichTextBlockKind = 'paragraph' | 'title' | 'subtitle' | 'quote';

/** Элемент списка с inline-содержимым (целевая модель). */
export type RichTextListItem = {
  id: string;
  content: RichText;
};

/**
 * Целевой union блоков редактора после миграции с Block.text: string.
 * Параллелен Block в EditArticleModalV2.utils — не заменяет его на этом этапе.
 */
export type RichTextCapableBlock =
  | { id: string; type: 'paragraph'; content: RichText }
  | { id: string; type: 'title'; content: RichText }
  | { id: string; type: 'subtitle'; content: RichText }
  | { id: string; type: 'quote'; content: RichText }
  | { id: string; type: 'list'; items: RichTextListItem[] }
  | { id: string; type: 'divider' }
  | { id: string; type: 'image'; imageKey: string; caption?: string }
  | { id: string; type: 'carousel'; images: CarouselImageItem[] };

/** Пустое inline-содержимое (константа для инициализации и сравнения). */
export const EMPTY_RICH_TEXT: RichText = [{ text: '', marks: [] }];
