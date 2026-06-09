import {
  ENABLE_EDITOR_DEBUG,
  ENABLE_MARKDOWN_DEBUG,
  getDefaultEditorMode,
  getVisibleEditorModes,
  isMarkdownEditorEnabled,
} from '../editorConfig';

describe('editorConfig', () => {
  test('rich is default mode and mode toggles are hidden when debug is off', () => {
    expect(ENABLE_EDITOR_DEBUG).toBe(false);
    expect(ENABLE_MARKDOWN_DEBUG).toBe(false);
    expect(getDefaultEditorMode()).toBe('rich');
    expect(getVisibleEditorModes()).toEqual([]);
    expect(isMarkdownEditorEnabled()).toBe(false);
  });
});
