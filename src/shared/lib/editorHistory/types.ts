import type { RichTextCapableBlock } from '@shared/lib/richText';

/** Плоское выделение внутри текстового поля блока (plain offsets). */
export type EditorSelection = {
  blockId: string;
  from: number;
  to: number;
};

export type EditorSnapshot<TBlock = RichTextCapableBlock> = {
  blocks: TBlock[];
  selection: EditorSelection | null;
};

export type EditorHistoryState<TSnapshot = EditorSnapshot> = {
  undoStack: TSnapshot[];
  redoStack: TSnapshot[];
};

export const DEFAULT_HISTORY_LIMIT = 50;
