/** Режимы RichTextBlockEditor. Markdown (textarea) и Preview — только для отладки. */
export type RichTextBlockEditorMode = 'textarea' | 'preview' | 'rich';

/** Скрытые режимы Preview/Markdown. Включить: ?editor=debug */
export const ENABLE_EDITOR_DEBUG = false;

export function isMarkdownEditorEnabled(): boolean {
  if (ENABLE_EDITOR_DEBUG) return true;
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get('editor') === 'debug';
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
  return [];
}
