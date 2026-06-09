import { mapMarkdownOffsetToPlain, mapPlainOffsetToMarkdown } from '@shared/lib/richText';

import { captureEditorSelection, restoreEditorCaret, restoreEditorSelection } from '../selection';

describe('editorHistory selection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('captures plain offsets from textarea markdown selection', () => {
    document.body.innerHTML = '<textarea data-block-id="block-1" id="ta">**ab**</textarea>';
    const textarea = document.getElementById('ta') as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(2, 4);

    const selection = captureEditorSelection();
    expect(selection).toEqual({
      blockId: 'block-1',
      from: mapMarkdownOffsetToPlain('**ab**', 2),
      to: mapMarkdownOffsetToPlain('**ab**', 4),
    });
  });

  it('restores plain offsets back to textarea markdown selection', () => {
    document.body.innerHTML = '<textarea data-block-id="block-1" id="ta">**ab**</textarea>';
    const textarea = document.getElementById('ta') as HTMLTextAreaElement;

    restoreEditorSelection('block-1', 1, 2);

    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(mapPlainOffsetToMarkdown('**ab**', 1));
    expect(textarea.selectionEnd).toBe(mapPlainOffsetToMarkdown('**ab**', 2));
  });

  it('restores rich mode selection via contentEditable', () => {
    document.body.innerHTML =
      '<div data-block-id="block-1" data-testid="rich-text-block-editor-rich" contenteditable="true">hello</div>';
    const rich = document.querySelector(
      '[data-testid="rich-text-block-editor-rich"]'
    ) as HTMLElement;

    restoreEditorSelection('block-1', 2, 4);

    expect(document.activeElement).toBe(rich);
    const selection = window.getSelection();
    expect(selection?.toString()).toBe('ll');
  });

  it('restoreEditorCaret supports legacy start/end aliases', () => {
    document.body.innerHTML = '<textarea data-block-id="block-1" id="ta">abc</textarea>';

    restoreEditorCaret('block-1', 'end');
    const textarea = document.getElementById('ta') as HTMLTextAreaElement;
    expect(textarea.selectionStart).toBe(3);
  });
});
