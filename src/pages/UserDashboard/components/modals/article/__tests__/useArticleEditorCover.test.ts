import { act, renderHook } from '@testing-library/react';

import { useArticleEditorCover } from '../useArticleEditorCover';

describe('useArticleEditorCover', () => {
  it('clears displayCoverKey immediately after handleCoverRemove', () => {
    const { result } = renderHook(() =>
      useArticleEditorCover({
        savedCoverKey: 'article_cover_test.jpg',
        ui: null,
      })
    );

    expect(result.current.displayCoverKey).toBe('article_cover_test.jpg');
    expect(result.current.hasCoverChanges).toBe(false);

    act(() => {
      result.current.handleCoverRemove();
    });

    expect(result.current.coverRemoved).toBe(true);
    expect(result.current.displayCoverKey).toBe('');
    expect(result.current.hasCoverChanges).toBe(true);
    expect(result.current.coverUpload.preview).toBeNull();
  });

  it('commitCoverForSave returns empty string when cover was removed', async () => {
    const { result } = renderHook(() =>
      useArticleEditorCover({
        savedCoverKey: 'article_cover_test.jpg',
        ui: null,
      })
    );

    act(() => {
      result.current.handleCoverRemove();
    });

    await expect(result.current.commitCoverForSave('article_cover_test.jpg')).resolves.toBe('');
  });

  it('does not remove cover when disabled', () => {
    const { result } = renderHook(() =>
      useArticleEditorCover({
        savedCoverKey: 'article_cover_test.jpg',
        ui: null,
        disabled: true,
      })
    );

    act(() => {
      result.current.handleCoverRemove();
    });

    expect(result.current.coverRemoved).toBe(false);
    expect(result.current.displayCoverKey).toBe('article_cover_test.jpg');
  });
});
