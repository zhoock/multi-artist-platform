/** @jest-environment jsdom */

import { describe, expect, jest, test } from '@jest/globals';
import { screen } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';

jest.mock('@shared/api/storage', () => ({
  uploadFile: jest.fn(),
  deleteHeroImage: jest.fn(async () => true),
}));

jest.mock('@shared/lib/auth', () => ({
  getUser: () => ({ id: 'user-1' }),
}));

jest.mock('../../modals/cover/CoverImageCropModal', () => ({
  CoverImageCropModal: () => null,
}));

import { HeaderImagesUpload } from '../HeaderImagesUpload';

describe('HeaderImagesUpload dropzone accessibility', () => {
  test('stacked dropzone is a label wired to the hidden file input', () => {
    renderWithProviders(<HeaderImagesUpload currentImages={[]} />, {
      preloadedState: { lang: { current: 'en' } },
    });

    const fileInput = document.querySelector('.header-images-upload__input') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput.id.length).toBeGreaterThan(0);

    const dropzone = screen.getByText(/upload cover|загрузить изображение/i).closest('label');
    expect(dropzone).toBeTruthy();
    expect(dropzone).toHaveAttribute('for', fileInput.id);
  });
});
