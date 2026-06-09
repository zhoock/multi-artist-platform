import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

import { getSelectionOffsets, restoreSelection } from '../domSelection';

describe('domSelection deleteContentForward caret restore', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
    window.getSelection()?.removeAllRanges();
  });

  test('restoreSelection keeps caret at end of text (ab|)', () => {
    root.textContent = 'ab';
    restoreSelection(root, 2, 2);
    expect(getSelectionOffsets(root)).toEqual({ from: 2, to: 2 });
  });

  test('restoreSelection keeps caret at end when a trailing empty text node exists', () => {
    root.appendChild(document.createTextNode('ab'));
    root.appendChild(document.createTextNode(''));
    restoreSelection(root, 2, 2);
    expect(getSelectionOffsets(root)).toEqual({ from: 2, to: 2 });
  });

  test('restoreSelection keeps caret at end inside formatted markup', () => {
    root.innerHTML = '<strong>ab</strong>';
    restoreSelection(root, 2, 2);
    expect(getSelectionOffsets(root)).toEqual({ from: 2, to: 2 });
  });

  test('restoreSelection does not jump to start when only empty text nodes remain', () => {
    root.appendChild(document.createTextNode(''));
    restoreSelection(root, 2, 2);
    expect(getSelectionOffsets(root)).toEqual({ from: 0, to: 0 });
  });
});
