/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from '@jest/globals';

import { useModalDraftSession } from '../useModalDraftSession';

describe('useModalDraftSession', () => {
  test('initializes draft from baseline when modal opens', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, baseline }) => useModalDraftSession({ isOpen, baseline }),
      {
        initialProps: { isOpen: false, baseline: 'saved' },
      }
    );

    rerender({ isOpen: true, baseline: 'saved' });

    expect(result.current.draft).toBe('saved');
    expect(result.current.hasChanges).toBe(false);
  });

  test('tracks draft edits without mutating baseline until commit', () => {
    const { result, rerender } = renderHook(
      ({ isOpen, baseline }) => useModalDraftSession({ isOpen, baseline }),
      {
        initialProps: { isOpen: true, baseline: 'saved lyrics' },
      }
    );

    act(() => {
      result.current.setDraft('draft lyrics');
    });

    expect(result.current.hasChanges).toBe(true);

    act(() => {
      result.current.discardDraft();
    });

    expect(result.current.draft).toBe('saved lyrics');
    expect(result.current.hasChanges).toBe(false);
  });

  test('commitDraft updates baseline used by later discard', () => {
    const { result } = renderHook(() =>
      useModalDraftSession({ isOpen: true, baseline: 'saved lyrics' })
    );

    act(() => {
      result.current.setDraft('draft lyrics');
      result.current.commitDraft('draft lyrics');
      result.current.setDraft('another draft');
    });

    expect(result.current.hasChanges).toBe(true);

    act(() => {
      result.current.discardDraft();
    });

    expect(result.current.draft).toBe('draft lyrics');
    expect(result.current.hasChanges).toBe(false);
  });
});
