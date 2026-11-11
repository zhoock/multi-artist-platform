import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import AlbumPageCover from '../AlbumPageCover';

const TEST_USER_ID = 'af97f741-8dae-410b-94a6-3f828f9140a4';
const SUPABASE_URL = 'https://jhpvetvfnsklpwswadle.supabase.co';
const FRONT = 'album_cover_uuid_artist-Cover-demo';
const BACK = 'album_cover_uuid_artist-Back-Cover-demo';

describe('AlbumPageCover', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, VITE_SUPABASE_URL: SUPABASE_URL };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('without backCover — same structure as plain AlbumCover (no flip wrapper)', () => {
    const { container } = render(
      <AlbumPageCover
        img={FRONT}
        userId={TEST_USER_ID}
        fullName="Demo Album"
        imageSource="cdn"
        loading="eager"
      />
    );

    expect(container.querySelector('.album-cover-flip')).toBeNull();
    expect(screen.getByRole('img', { name: /обложка альбома/i })).toBeTruthy();
  });

  test('with backCover — flip scaffold and lazy back image', () => {
    const { container } = render(
      <AlbumPageCover
        img={FRONT}
        backCover={BACK}
        userId={TEST_USER_ID}
        fullName="Demo Album"
        imageSource="cdn"
        loading="eager"
      />
    );

    expect(container.querySelector('.album-page-cover')).not.toBeNull();
    expect(container.querySelector('.album-page-cover__sizer')).not.toBeNull();
    expect(container.querySelector('.album-cover-flip')).not.toBeNull();
    expect(container.querySelector('.album-cover-flip__face--front')).not.toBeNull();
    expect(container.querySelector('.album-cover-flip__face--back')).not.toBeNull();

    const backImg = container.querySelector('.album-cover__image--flip-back');
    expect(backImg).not.toBeNull();
    expect(backImg).toHaveAttribute('loading', 'lazy');
    expect(backImg!.getAttribute('src')).toContain(`${BACK}.webp`);
    expect(backImg!.getAttribute('src')).toContain('supabase.co');

    expect(screen.getByRole('img', { name: /обложка альбома/i })).toBeTruthy();
  });

  test('with backCover — tap toggles touch flip class on coarse pointer', () => {
    const matchMedia = jest.fn((query: string) => ({
      matches: query === '(hover: none) and (pointer: coarse)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });

    const { container } = render(
      <AlbumPageCover
        img={FRONT}
        backCover={BACK}
        userId={TEST_USER_ID}
        fullName="Demo Album"
        imageSource="cdn"
        loading="eager"
      />
    );

    const flip = container.querySelector('.album-cover-flip');
    expect(flip).not.toBeNull();
    expect(flip).not.toHaveClass('album-cover-flip--flipped');

    fireEvent.click(flip!);
    expect(flip).toHaveClass('album-cover-flip--flipped');

    fireEvent.click(flip!);
    expect(flip).not.toHaveClass('album-cover-flip--flipped');
  });

  test('with backCover — tap does not toggle flip on fine pointer (desktop)', () => {
    const matchMedia = jest.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });

    const { container } = render(
      <AlbumPageCover
        img={FRONT}
        backCover={BACK}
        userId={TEST_USER_ID}
        fullName="Demo Album"
        imageSource="cdn"
        loading="eager"
      />
    );

    const flip = container.querySelector('.album-cover-flip');
    fireEvent.click(flip!);
    expect(flip).not.toHaveClass('album-cover-flip--flipped');
  });
});
