import type { RichTextCapableBlock } from '@shared/lib/richText';
import { markdownToRichText, richTextToPlainText } from '@shared/lib/richText';

import { cloneSnapshot } from '../cloneSnapshot';
import { canRedo, canUndo, createHistoryState, pushSnapshot, redo, undo } from '../operations';
import type { EditorSelection, EditorSnapshot } from '../types';

describe('editorHistory operations', () => {
  const blockA = {
    id: 'a',
    type: 'paragraph' as const,
    content: markdownToRichText('hello'),
  };

  const blockB = {
    id: 'b',
    type: 'paragraph' as const,
    content: markdownToRichText('world'),
  };

  const snap = (blocks: RichTextCapableBlock[], selection: EditorSelection | null = null) =>
    ({ blocks: cloneSnapshot(blocks), selection }) satisfies EditorSnapshot;

  it('pushSnapshot appends to undo stack and clears redo', () => {
    let state = createHistoryState();
    state = pushSnapshot(state, snap([blockA]));
    state = pushSnapshot(state, snap([blockA, blockB]));

    expect(state.undoStack).toHaveLength(2);
    expect(state.redoStack).toHaveLength(0);
  });

  it('undo restores previous snapshot and pushes current to redo', () => {
    let state = createHistoryState();
    const before = snap([blockA]);
    const after = snap([blockA, blockB]);
    state = pushSnapshot(state, before);

    const result = undo(state, after);
    expect(result).not.toBeNull();
    expect(result!.snapshot.blocks).toHaveLength(1);
    const first = result!.snapshot.blocks[0];
    if (first.type !== 'paragraph') throw new Error('expected paragraph');
    expect(richTextToPlainText(first.content)).toBe('hello');
    expect(result!.state.redoStack).toHaveLength(1);
    expect(result!.state.undoStack).toHaveLength(0);
  });

  it('redo restores from redo stack', () => {
    let state = createHistoryState();
    const before = snap([blockA]);
    const after = snap([blockA, blockB]);
    state = pushSnapshot(state, before);

    const undone = undo(state, after)!;
    const redone = redo(undone.state, before)!;

    expect(redone.snapshot.blocks).toHaveLength(2);
    expect(canUndo(redone.state)).toBe(true);
    expect(canRedo(redone.state)).toBe(false);
  });

  it('canUndo / canRedo reflect stack lengths', () => {
    const state = createHistoryState();
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
  });

  it('cloneSnapshot produces independent copy', () => {
    const original = snap([blockA], { blockId: 'a', from: 2, to: 2 });
    const copy = cloneSnapshot(original);
    copy.blocks.push(blockB);
    copy.selection!.from = 5;

    expect(original.blocks).toHaveLength(1);
    expect(original.selection!.from).toBe(2);
  });
});
