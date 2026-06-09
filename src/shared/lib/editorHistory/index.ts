export type { EditorHistoryState, EditorSelection, EditorSnapshot } from './types';
export { DEFAULT_HISTORY_LIMIT } from './types';

export { cloneSnapshot } from './cloneSnapshot';

export {
  canRedo,
  canUndo,
  clearRedo,
  createHistoryState,
  pushSnapshot,
  redo,
  undo,
} from './operations';

export {
  captureEditorSelection,
  captureEditorSelectionOrFallback,
  restoreEditorCaret,
  restoreEditorSelection,
} from './selection';
