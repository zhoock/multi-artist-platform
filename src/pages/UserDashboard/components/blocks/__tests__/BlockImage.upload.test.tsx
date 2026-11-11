import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';

jest.mock('@shared/lib/auth', () => ({
  getUser: () => ({ id: 'test-user-id' }),
}));

jest.mock('@shared/api/albums', () => ({
  getUserImageUrl: () => 'https://example.test/article-image.jpg',
}));

const uploadArticleBlockImage = jest.fn<(file: File) => Promise<string | null>>();
jest.mock('../uploadArticleBlockImage', () => ({
  uploadArticleBlockImage: (file: File) => uploadArticleBlockImage(file),
}));

import { BlockImage } from '../BlockImage';

describe('BlockImage upload feedback', () => {
  beforeEach(() => {
    uploadArticleBlockImage.mockReset();
    global.URL.createObjectURL = jest.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = jest.fn();
  });

  test('shows upload slot with spinner immediately after file select', async () => {
    let resolveUpload!: (value: string | null) => void;
    uploadArticleBlockImage.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      })
    );

    const onChange = jest.fn();
    const { container } = render(<BlockImage onChange={onChange} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(container.querySelector('.edit-article-v2__image-upload-overlay')).toBeTruthy();
      expect(container.querySelector('.edit-article-v2__carousel-edit-add-spinner')).toBeTruthy();
    });

    resolveUpload('uploaded.jpg');
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('uploaded.jpg', undefined);
    });
  });

  test('renders parent-controlled pending upload with preview', () => {
    const { container } = render(
      <BlockImage
        onChange={jest.fn()}
        pendingUpload={{ status: 'uploading', previewUrl: 'blob:parent-preview' }}
      />
    );

    expect(container.querySelector('.edit-article-v2__image-upload-overlay')).toBeTruthy();
    const img = container.querySelector('.edit-article-v2__image-container img');
    expect(img).toHaveAttribute('src', 'blob:parent-preview');
  });
});
