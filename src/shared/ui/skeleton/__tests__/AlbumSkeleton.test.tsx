import { render, screen } from '@testing-library/react';

import { AlbumSkeleton } from '../AlbumSkeleton';

describe('AlbumSkeleton', () => {
  it('mirrors the public album page block order', () => {
    render(<AlbumSkeleton />);

    const root = screen.getByLabelText('Скелетон альбома');
    const positions = [
      root.querySelector('.album-skeleton__cover-block'),
      root.querySelector('.album-title'),
      root.querySelector('.album-artist'),
      root.querySelector('.wrapper-album-play'),
      root.querySelector('.tracks'),
      root.querySelector('.album__share'),
    ];

    expect(positions.every(Boolean)).toBe(true);

    for (let i = 1; i < positions.length; i += 1) {
      expect(
        positions[i - 1]!.compareDocumentPosition(positions[i]!) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  it('keeps cover, title and artist as compact placeholders', () => {
    const { container } = render(<AlbumSkeleton />);

    expect(container.querySelector('.album__wrapper.album-skeleton')).toBeTruthy();
    expect(container.querySelector('.skeleton--album-cover')).toBeTruthy();
    expect(container.querySelector('.skeleton--album-title')).toBeTruthy();
    expect(container.querySelector('.skeleton--album-artist')).toBeTruthy();
    expect(container.querySelector('.skeleton--play-label')).toBeTruthy();
    expect(container.querySelector('.skeleton--play-progress')).toBeNull();
  });
});
