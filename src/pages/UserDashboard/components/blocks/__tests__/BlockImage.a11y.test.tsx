import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

jest.mock('@shared/lib/auth', () => ({
  getUser: () => ({ id: 'test-user-id' }),
}));

jest.mock('@shared/api/albums', () => ({
  getUserImageUrl: () => 'https://example.test/article-image.jpg',
}));

import { BlockImage } from '../BlockImage';

describe('BlockImage image container keyboard selection', () => {
  const onSelect = jest.fn();

  beforeEach(() => {
    onSelect.mockClear();
  });

  function renderWithImage(extra?: Partial<React.ComponentProps<typeof BlockImage>>) {
    const view = render(
      <BlockImage
        imageKey="article-img.jpg"
        caption="Photo caption"
        onChange={jest.fn()}
        onSelect={onSelect}
        onConvertToCarousel={jest.fn()}
        {...extra}
      />
    );
    const container = view.container.querySelector('.edit-article-v2__image-container');
    if (!container) {
      throw new Error('Expected .edit-article-v2__image-container');
    }
    return container as HTMLDivElement;
  }

  test('click on image container calls onSelect', () => {
    const container = renderWithImage();
    fireEvent.click(container);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test('Enter on focused image container calls onSelect', () => {
    const container = renderWithImage();
    container.focus();
    fireEvent.keyDown(container, { key: 'Enter', code: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test('Space on focused image container calls onSelect and prevents default', () => {
    const container = renderWithImage();
    container.focus();
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const preventDefault = jest.spyOn(event, 'preventDefault');
    container.dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test('Space via fireEvent prevents default scroll behavior', () => {
    const container = renderWithImage();
    container.focus();
    const event = fireEvent.keyDown(container, { key: ' ', code: 'Space' });
    expect(event).toBe(false);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test('Enter on nested carousel button does not call onSelect', () => {
    renderWithImage({ isSelected: true });
    const convertButton = screen.getByRole('button', { name: 'Создать карусель' });
    convertButton.focus();
    fireEvent.keyDown(convertButton, { key: 'Enter', code: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('click on nested carousel button does not call onSelect', () => {
    renderWithImage({ isSelected: true });
    const convertButton = screen.getByRole('button', { name: 'Создать карусель' });
    fireEvent.click(convertButton);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
