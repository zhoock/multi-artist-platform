import { fireEvent, render, screen } from '@testing-library/react';

import { ArticleEditorCover } from '../ArticleEditorCover';
import type { ArticleCoverUploadState } from '../useArticleEditorCover';

jest.mock('@entities/article', () => ({
  ArticleCoverImage: ({ img }: { img: string }) => (
    <img data-testid="cover-image" alt="" src={img} />
  ),
  ArticleCoverPlaceholder: () => <div data-testid="cover-placeholder">placeholder</div>,
}));

const EMPTY_UPLOAD: ArticleCoverUploadState = {
  preview: null,
  status: 'idle',
  progress: 0,
  error: null,
  dragActive: false,
};

const texts = {
  label: 'Article cover',
  uploadPrompt: 'Upload cover',
  uploadFormats: 'JPG, PNG or WebP',
  chooseFile: 'Choose file',
  replaceCover: 'Replace cover',
  removeCover: 'Remove cover',
  recommendedResolution: 'Recommended resolution',
};

describe('ArticleEditorCover', () => {
  it('calls onRemove when delete button is clicked', () => {
    const onRemove = jest.fn();

    render(
      <ArticleEditorCover
        articleId="article-1"
        coverKey="article_cover_test.jpg"
        ownerUserId="user-1"
        uploadState={EMPTY_UPLOAD}
        texts={texts}
        onDrag={jest.fn()}
        onDrop={jest.fn()}
        onFileInput={jest.fn()}
        onRemove={onRemove}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove cover' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows empty state when coverKey is cleared', () => {
    const { rerender } = render(
      <ArticleEditorCover
        articleId="article-1"
        coverKey="article_cover_test.jpg"
        ownerUserId="user-1"
        uploadState={EMPTY_UPLOAD}
        texts={texts}
        onDrag={jest.fn()}
        onDrop={jest.fn()}
        onFileInput={jest.fn()}
        onRemove={jest.fn()}
      />
    );

    expect(screen.getByTestId('cover-image')).toBeTruthy();
    expect(screen.queryByText('Upload cover')).toBeNull();

    rerender(
      <ArticleEditorCover
        articleId="article-1"
        coverKey=""
        ownerUserId="user-1"
        uploadState={EMPTY_UPLOAD}
        texts={texts}
        onDrag={jest.fn()}
        onDrop={jest.fn()}
        onFileInput={jest.fn()}
        onRemove={jest.fn()}
      />
    );

    expect(screen.queryByTestId('cover-image')).toBeNull();
    expect(screen.getByText('Upload cover')).toBeTruthy();
  });

  it('shows empty state when coverRemoved is true even if coverKey is still set', () => {
    render(
      <ArticleEditorCover
        articleId="article-1"
        coverKey="article_cover_test.jpg"
        coverRemoved
        ownerUserId="user-1"
        uploadState={EMPTY_UPLOAD}
        texts={texts}
        onDrag={jest.fn()}
        onDrop={jest.fn()}
        onFileInput={jest.fn()}
        onRemove={jest.fn()}
      />
    );

    expect(screen.queryByTestId('cover-image')).toBeNull();
    expect(screen.getByText('Upload cover')).toBeTruthy();
  });
});
