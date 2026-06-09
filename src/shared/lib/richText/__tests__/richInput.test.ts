import { describe, test, expect } from '@jest/globals';

import { markdownToRichText } from '../markdownAdapter';
import { richTextToPlainText } from '../operations';
import { applyPlainTextInsert, deleteRange, planMultilinePaste, splitAtEnter } from '../richInput';

describe('richInput', () => {
  test('splitAtEnter splits plain text at offset', () => {
    const content = markdownToRichText('abcdef');
    const { before, after } = splitAtEnter(content, 3);
    expect(richTextToPlainText(before)).toBe('abc');
    expect(richTextToPlainText(after)).toBe('def');
  });

  test('applyPlainTextInsert replaces selection', () => {
    const content = markdownToRichText('abcdef');
    const { content: next, caret } = applyPlainTextInsert(content, 'X', { from: 2, to: 4 });
    expect(richTextToPlainText(next)).toBe('abXef');
    expect(caret).toBe(3);
  });

  test('planMultilinePaste splits into leading, middle and trailing blocks', () => {
    const content = markdownToRichText('abcdef');
    const plan = planMultilinePaste(content, 'x\ny\nz', { from: 3, to: 3 });
    expect(plan).not.toBeNull();
    expect(richTextToPlainText(plan!.leadingContent)).toBe('abcx');
    expect(plan!.middleBlocks).toHaveLength(1);
    expect(richTextToPlainText(plan!.middleBlocks[0])).toBe('y');
    expect(richTextToPlainText(plan!.trailingContent)).toBe('zdef');
    expect(plan!.focusOffset).toBe(1);
  });

  test('deleteRange removes selected span', () => {
    const content = markdownToRichText('abcdef');
    const next = deleteRange(content, 2, 4);
    expect(richTextToPlainText(next)).toBe('abef');
  });
});
