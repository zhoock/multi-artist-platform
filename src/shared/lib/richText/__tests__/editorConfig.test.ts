import {
  ENABLE_MARKDOWN_DEBUG,
  getDefaultEditorMode,
  getVisibleEditorModes,
  isMarkdownEditorEnabled,
} from '../editorConfig';

describe('editorConfig', () => {
  test('rich is default mode when markdown debug is off', () => {
    expect(ENABLE_MARKDOWN_DEBUG).toBe(false);
    expect(getDefaultEditorMode()).toBe('rich');
    expect(getVisibleEditorModes()).toEqual(['rich', 'preview']);
    expect(isMarkdownEditorEnabled()).toBe(false);
  });
});
