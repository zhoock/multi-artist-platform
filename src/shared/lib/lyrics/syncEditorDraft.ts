import type { SyncedLyricsLine } from '@/models';

export type SyncEditorSnapshot = {
  lines: SyncedLyricsLine[];
  authorship: string;
};

export function normalizeSyncEditorAuthorship(value: string | undefined | null): string {
  return (value ?? '').trim();
}

export function areSyncedLyricsLinesEqual(
  left: SyncedLyricsLine[],
  right: SyncedLyricsLine[]
): boolean {
  if (left.length !== right.length) return false;

  return left.every((line, index) => {
    const other = right[index];
    return (
      line.text === other.text &&
      (line.startTime ?? 0) === (other.startTime ?? 0) &&
      line.endTime === other.endTime
    );
  });
}

export function areSyncEditorSnapshotsEqual(
  left: SyncEditorSnapshot,
  right: SyncEditorSnapshot
): boolean {
  return (
    normalizeSyncEditorAuthorship(left.authorship) ===
      normalizeSyncEditorAuthorship(right.authorship) &&
    areSyncedLyricsLinesEqual(left.lines, right.lines)
  );
}

export function cloneSyncEditorSnapshot(snapshot: SyncEditorSnapshot): SyncEditorSnapshot {
  return {
    authorship: snapshot.authorship,
    lines: snapshot.lines.map((line) => ({ ...line })),
  };
}
