import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

import { getSelectionOffsets, pointToOffset, restoreSelection } from '../domSelection';

describe('domSelection', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    // "ab" (bold) + "cd" (plain) → плоский текст "abcd".
    root.innerHTML = '<strong>ab</strong>cd';
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
    window.getSelection()?.removeAllRanges();
  });

  test('pointToOffset counts plain text length up to a DOM point', () => {
    const boldText = root.querySelector('strong')!.firstChild!;
    const plainText = root.childNodes[1];

    expect(pointToOffset(root, boldText, 0)).toBe(0);
    expect(pointToOffset(root, boldText, 2)).toBe(2);
    expect(pointToOffset(root, plainText, 1)).toBe(3);
  });

  test('restoreSelection then getSelectionOffsets round-trips offsets', () => {
    restoreSelection(root, 1, 3);
    expect(getSelectionOffsets(root)).toEqual({ from: 1, to: 3 });
  });

  test('restoreSelection collapses caret across element boundaries', () => {
    restoreSelection(root, 2, 2);
    expect(getSelectionOffsets(root)).toEqual({ from: 2, to: 2 });
  });

  test('restoreSelection clamps offsets beyond the end', () => {
    restoreSelection(root, 4, 4);
    expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });

    restoreSelection(root, 0, 99);
    expect(getSelectionOffsets(root)).toEqual({ from: 0, to: 4 });
  });

  test('counts <br> as one character in flat offsets', () => {
    root.innerHTML = 'abc<br>def';
    expect(getSelectionOffsets(root)).toBeNull();

    restoreSelection(root, 3, 3);
    expect(getSelectionOffsets(root)).toEqual({ from: 3, to: 3 });

    restoreSelection(root, 4, 4);
    expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });

    restoreSelection(root, 7, 7);
    expect(getSelectionOffsets(root)).toEqual({ from: 7, to: 7 });
  });

  test('restoreSelection places caret after trailing <br>', () => {
    root.innerHTML = 'abc<br>';
    restoreSelection(root, 4, 4);
    expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });
  });

  test('sentinel <br data-rich-trailing> is excluded from flat offsets', () => {
    root.innerHTML = 'abc<br><br data-rich-trailing="true">';

    // Полная длина — 4 (sentinel не считается): клампится к 4.
    restoreSelection(root, 99, 99);
    expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });

    // Каретка на offset 4 встаёт между настоящим <br> и sentinel.
    restoreSelection(root, 4, 4);
    const selection = window.getSelection()!;
    const range = selection.getRangeAt(0);
    expect(range.startContainer).toBe(root);
    expect(range.startOffset).toBe(2);
    expect(getSelectionOffsets(root)).toEqual({ from: 4, to: 4 });
  });

  test('getSelectionOffsets returns null when selection is outside root', () => {
    const outside = document.createElement('div');
    outside.textContent = 'zzz';
    document.body.appendChild(outside);

    const range = document.createRange();
    range.setStart(outside.firstChild!, 0);
    range.setEnd(outside.firstChild!, 2);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(getSelectionOffsets(root)).toBeNull();
    outside.remove();
  });
});
