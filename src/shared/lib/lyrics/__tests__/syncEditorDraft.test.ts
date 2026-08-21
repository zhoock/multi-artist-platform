import { describe, expect, test } from '@jest/globals';

import { areSyncEditorSnapshotsEqual, areSyncedLyricsLinesEqual } from '../syncEditorDraft';

describe('syncEditorDraft', () => {
  test('detects timing changes between otherwise identical lines', () => {
    const saved = [{ text: 'Line', startTime: 1, endTime: 2 }];
    const draft = [{ text: 'Line', startTime: 1.5, endTime: 2 }];

    expect(areSyncedLyricsLinesEqual(saved, draft)).toBe(false);
    expect(
      areSyncEditorSnapshotsEqual(
        { lines: saved, authorship: 'Author' },
        { lines: draft, authorship: 'Author' }
      )
    ).toBe(false);
  });

  test('treats equivalent snapshots as unchanged', () => {
    const snapshot = {
      lines: [{ text: 'Line', startTime: 1, endTime: 2 }],
      authorship: ' Author ',
    };

    expect(
      areSyncEditorSnapshotsEqual(snapshot, {
        lines: [{ text: 'Line', startTime: 1, endTime: 2 }],
        authorship: 'Author',
      })
    ).toBe(true);
  });
});
