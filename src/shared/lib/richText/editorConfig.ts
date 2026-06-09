/** Режимы RichTextBlockEditor. Markdown (textarea) — только для отладки. */
export type RichTextBlockEditorMode = 'textarea' | 'preview' | 'rich';

/** Скрытый markdown-режим для отладки сериализации. Включить: ?editor=markdown */
export const ENABLE_MARKDOWN_DEBUG = false;

export function isMarkdownEditorEnabled(): boolean {
  if (ENABLE_MARKDOWN_DEBUG) return true;
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get('editor') === 'markdown';
  }
  return false;
}

export function getDefaultEditorMode(): RichTextBlockEditorMode {
  return 'rich';
}

export function getVisibleEditorModes(): RichTextBlockEditorMode[] {
  if (isMarkdownEditorEnabled()) {
    return ['textarea', 'preview', 'rich'];
  }
  return ['rich', 'preview'];
}
