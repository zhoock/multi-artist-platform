import {
  getSelectionOffsets,
  mapMarkdownOffsetToPlain,
  mapPlainOffsetToMarkdown,
  restoreSelection,
} from '@shared/lib/richText';

import type { EditorSelection } from './types';

function queryRichRoot(blockId: string): HTMLElement | null {
  return document.querySelector(
    `[data-block-id="${blockId}"][data-testid="rich-text-block-editor-rich"]`
  ) as HTMLElement | null;
}

function queryTextarea(blockId: string): HTMLTextAreaElement | null {
  return (
    (document.querySelector(
      `textarea[data-block-id="${blockId}"]`
    ) as HTMLTextAreaElement | null) ??
    (document.querySelector(`[data-block-id="${blockId}"] textarea`) as HTMLTextAreaElement | null)
  );
}

/** Читает текущее выделение из DOM (rich или textarea) как plain offsets. */
export function captureEditorSelection(): EditorSelection | null {
  const active = document.activeElement;
  if (!active) return null;

  if (active instanceof HTMLElement && active.isContentEditable) {
    const blockId = active.getAttribute('data-block-id');
    if (!blockId) return null;
    const offsets = getSelectionOffsets(active);
    if (!offsets) return null;
    return { blockId, from: offsets.from, to: offsets.to };
  }

  if (active instanceof HTMLTextAreaElement) {
    const blockId = active.getAttribute('data-block-id');
    if (!blockId) return null;
    const mdFrom = active.selectionStart ?? 0;
    const mdTo = active.selectionEnd ?? mdFrom;
    return {
      blockId,
      from: mapMarkdownOffsetToPlain(active.value, mdFrom),
      to: mapMarkdownOffsetToPlain(active.value, mdTo),
    };
  }

  return null;
}

/** Восстанавливает выделение [from, to] в rich mode или textarea блока. */
export function restoreEditorSelection(blockId: string, from: number, to: number = from): boolean {
  const rich = queryRichRoot(blockId);
  if (rich) {
    rich.focus();
    restoreSelection(rich, from, to);
    return true;
  }

  const textarea = queryTextarea(blockId);
  if (textarea) {
    textarea.focus();
    const mdFrom = mapPlainOffsetToMarkdown(textarea.value, from);
    const mdTo = mapPlainOffsetToMarkdown(textarea.value, to);
    textarea.setSelectionRange(mdFrom, mdTo);
    return true;
  }

  return false;
}

/** Legacy helper: 'start' | 'end' | markdown/plain offset depending on plainCaret. */
export function restoreEditorCaret(
  blockId: string,
  position: 'start' | 'end' | number,
  plainCaret = false
): boolean {
  if (position === 'start') {
    return restoreEditorSelection(blockId, 0, 0);
  }
  if (position === 'end') {
    const rich = queryRichRoot(blockId);
    if (rich) {
      const length = rich.innerText.length;
      return restoreEditorSelection(blockId, length, length);
    }
    const textarea = queryTextarea(blockId);
    if (textarea) {
      if (plainCaret) {
        const length = mapMarkdownOffsetToPlain(textarea.value, textarea.value.length);
        return restoreEditorSelection(blockId, length, length);
      }
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      return true;
    }
    return false;
  }

  if (plainCaret) {
    return restoreEditorSelection(blockId, position, position);
  }

  const textarea = queryTextarea(blockId);
  if (textarea) {
    textarea.focus();
    const clamped = Math.min(position, textarea.value.length);
    textarea.setSelectionRange(clamped, clamped);
    return true;
  }

  return restoreEditorSelection(blockId, position, position);
}

export function captureEditorSelectionOrFallback(
  fallbackBlockId: string | null,
  fallbackSelectedBlockId: string | null
): EditorSelection | null {
  const captured = captureEditorSelection();
  if (captured) return captured;

  if (fallbackSelectedBlockId) {
    return { blockId: fallbackSelectedBlockId, from: 0, to: 0 };
  }

  if (fallbackBlockId) {
    return { blockId: fallbackBlockId, from: 0, to: 0 };
  }

  return null;
}
