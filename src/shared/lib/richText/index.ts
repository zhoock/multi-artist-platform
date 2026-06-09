/**
 * Каноническая модель inline rich text для статей.
 */
export type {
  EmptyRichText,
  FutureInlineMarkType,
  InlineMark,
  InlineMarkType,
  RichText,
  RichTextBlockKind,
  RichTextCapableBlock,
  RichTextListItem,
  RichTextNode,
  SupportedInlineMarkType,
} from './types';

export { EMPTY_RICH_TEXT } from './types';

export {
  cloneRichText,
  insertText,
  isRichTextEmpty,
  mergeAdjacentNodes,
  normalizeRichText,
  removeLink,
  richTextToPlainText,
  setLink,
  splitNode,
  splitRichTextAt,
  toggleMark,
} from './operations';

export { renderRichText } from './renderRichText';

export { sanitizeHref } from './sanitizeHref';

export { MARK_RENDER_ORDER, markRenderOrderIndex, sortMarksByRenderOrder } from './markOrder';

export {
  mapMarkdownOffsetToPlain,
  mapPlainOffsetToMarkdown,
  markdownToRichText,
  richTextToMarkdown,
} from './markdownAdapter';

export { renderMarkdownViaRichText } from './renderMarkdownViaRichText';

export {
  getActiveMarks,
  getLinkAtSelection,
  getMarkRange,
  isCollapsedSelection,
  type MarkRange,
} from './selection';

export {
  getSelectionOffsets,
  pointToOffset,
  restoreSelection,
  type SelectionOffsets,
} from './domSelection';

export {
  ENABLE_EDITOR_DEBUG,
  ENABLE_MARKDOWN_DEBUG,
  getDefaultEditorMode,
  getVisibleEditorModes,
  isMarkdownEditorEnabled,
  type RichTextBlockEditorMode,
} from './editorConfig';
