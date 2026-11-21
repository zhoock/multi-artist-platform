import { describe, test, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import React from 'react';

jest.mock('@shared/api/albums', () => ({
  getUserImageUrl: () => 'https://example.test/carousel-slide.jpg',
}));

jest.mock('@shared/lib/media/optionalMediaUrl', () => ({
  optionalMediaSrc: (url: string) => url,
}));

import { BlockCarousel } from '../BlockCarousel';

describe('BlockCarousel selection layout', () => {
  const images = [{ imageKey: 'slide-1.jpg', caption: 'First slide' }, { imageKey: 'slide-2.jpg' }];

  test('caption input sits outside carousel image wrapper when selected', () => {
    const { container } = render(
      <BlockCarousel images={images} onChange={jest.fn()} isSelected onSelect={jest.fn()} />
    );

    const wrapper = container.querySelector('.edit-article-v2__carousel-image-wrapper--selected');
    expect(wrapper).toBeTruthy();

    const caption = screen.getByLabelText('Подпись к изображению (необязательно)');
    expect(wrapper?.contains(caption)).toBe(false);
  });

  test('caption display stays outside image wrapper when not selected', () => {
    const { container } = render(
      <BlockCarousel images={images} onChange={jest.fn()} isSelected={false} onSelect={jest.fn()} />
    );

    const wrapper = container.querySelector('.edit-article-v2__carousel-image-wrapper');
    const captionDisplay = container.querySelector('.edit-article-v2__media-caption-display');

    expect(wrapper).toBeTruthy();
    expect(captionDisplay).toBeTruthy();
    expect(wrapper?.contains(captionDisplay)).toBe(false);
  });

  test('renders no caption field when not selected', () => {
    render(
      <BlockCarousel images={images} onChange={jest.fn()} isSelected={false} onSelect={jest.fn()} />
    );

    expect(screen.queryByLabelText('Подпись к изображению (необязательно)')).toBeNull();
  });
});
