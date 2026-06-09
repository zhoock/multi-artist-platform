import { DEFAULT_HISTORY_LIMIT, type EditorHistoryState, type EditorSnapshot } from './types';

export function createHistoryState<TSnapshot = EditorSnapshot>(): EditorHistoryState<TSnapshot> {
  return { undoStack: [], redoStack: [] };
}

export function canUndo<TSnapshot>(state: EditorHistoryState<TSnapshot>): boolean {
  return state.undoStack.length > 0;
}

export function canRedo<TSnapshot>(state: EditorHistoryState<TSnapshot>): boolean {
  return state.redoStack.length > 0;
}

export function clearRedo<TSnapshot>(
  state: EditorHistoryState<TSnapshot>
): EditorHistoryState<TSnapshot> {
  if (state.redoStack.length === 0) return state;
  return { ...state, redoStack: [] };
}

export function pushSnapshot<TSnapshot>(
  state: EditorHistoryState<TSnapshot>,
  snapshot: TSnapshot,
  maxSize = DEFAULT_HISTORY_LIMIT
): EditorHistoryState<TSnapshot> {
  return {
    undoStack: [...state.undoStack, snapshot].slice(-maxSize),
    redoStack: [],
  };
}

export function undo<TSnapshot>(
  state: EditorHistoryState<TSnapshot>,
  currentSnapshot: TSnapshot
): { state: EditorHistoryState<TSnapshot>; snapshot: TSnapshot } | null {
  if (state.undoStack.length === 0) return null;

  const snapshot = state.undoStack[state.undoStack.length - 1];
  return {
    state: {
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [currentSnapshot, ...state.redoStack],
    },
    snapshot,
  };
}

export function redo<TSnapshot>(
  state: EditorHistoryState<TSnapshot>,
  currentSnapshot: TSnapshot
): { state: EditorHistoryState<TSnapshot>; snapshot: TSnapshot } | null {
  if (state.redoStack.length === 0) return null;

  const snapshot = state.redoStack[0];
  return {
    state: {
      undoStack: [...state.undoStack, currentSnapshot],
      redoStack: state.redoStack.slice(1),
    },
    snapshot,
  };
}
