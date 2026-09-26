/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { CarouselEditModal } from '../CarouselEditModal';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      uiDictionary: { entries: [{ dashboard: { closeDiscardConfirm: {} } }] },
    }),
}));

jest.mock('@shared/model/uiDictionary', () => ({
  selectUiDictionaryFirst: (state: { uiDictionary: { entries: Array<object> } }) =>
    state.uiDictionary.entries[0],
}));

jest.mock('@shared/lib/media/optionalMediaUrl', () => ({
  optionalMediaSrc: () => 'https://cdn.example.com/carousel-thumb.jpg',
}));

jest.mock('@shared/api/albums', () => ({
  getUserImageUrl: () => 'users/u1/articles/x.jpg',
}));

jest.mock('@shared/api/storage', () => ({
  uploadFile: jest.fn(),
}));

describe('CarouselEditModal thumbnail alt text', () => {
  beforeEach(() => {
    jest.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function showModal(
      this: HTMLDialogElement
    ) {
      this.open = true;
    });
    jest.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function close(
      this: HTMLDialogElement
    ) {
      this.open = false;
    });
  });

  test('uses non-redundant alt for carousel thumbnails', () => {
    render(
      <CarouselEditModal
        blockId="block-1"
        initialImageKeys={['article_cover_1']}
        onSave={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    const thumb = screen.getByRole('img', { name: 'Carousel slide 1' });
    expect(thumb.getAttribute('alt')).toBe('Carousel slide 1');
    expect(thumb.getAttribute('alt')?.toLowerCase()).not.toMatch(/\b(image|photo|picture)\b/);
  });
});
