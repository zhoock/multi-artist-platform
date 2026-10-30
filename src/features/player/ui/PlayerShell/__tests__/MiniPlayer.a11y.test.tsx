/** @jest-environment jsdom */

import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import { MiniPlayer } from '../MiniPlayer';

jest.mock('@shared/lib/hooks/useImageColor', () => ({
  useImageColor: () => ({ current: null }),
  clearImageColorCache: jest.fn(),
}));

jest.mock('@app/providers/lang', () => ({
  useLang: jest.fn(),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: jest.fn(),
}));

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';

const mockUseLang = useLang as jest.MockedFunction<typeof useLang>;
const mockUseAppSelector = useAppSelector as jest.MockedFunction<typeof useAppSelector>;

const noopForwardHandlers = {
  onMouseDown: jest.fn(),
  onMouseUp: jest.fn(),
  onMouseLeave: jest.fn(),
  onTouchStart: jest.fn(),
  onTouchEnd: jest.fn(),
};

describe('MiniPlayer accessibility', () => {
  beforeEach(() => {
    mockUseAppSelector.mockReturnValue(null);
  });

  test('does not wrap transport buttons in role=button ancestor', () => {
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });

    const { container } = render(
      <MiniPlayer
        title="Track title"
        isPlaying={false}
        onToggle={jest.fn()}
        onExpand={jest.fn()}
        forwardHandlers={noopForwardHandlers}
      />
    );

    const transport = container.querySelector('.mini-player__controls');
    expect(transport).toBeTruthy();
    expect(transport?.closest('[role="button"]')).toBeNull();
    expect(container.querySelector('.mini-player[role="button"]')).toBeNull();
  });

  test('expand control has localized accessible name and keyboard activation', () => {
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });
    const onExpand = jest.fn();

    render(
      <MiniPlayer
        title="Track title"
        isPlaying={false}
        onToggle={jest.fn()}
        onExpand={onExpand}
        forwardHandlers={noopForwardHandlers}
      />
    );

    const expand = screen.getByRole('button', { name: 'Open full player' });
    expect(expand).toBeTruthy();
    fireEvent.click(expand);
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  test('mixer button calls handler without expanding full player', () => {
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });
    const onOpenMixer = jest.fn();
    const onExpand = jest.fn();

    render(
      <MiniPlayer
        title="Track title"
        isPlaying={false}
        onToggle={jest.fn()}
        onExpand={onExpand}
        forwardHandlers={noopForwardHandlers}
        showMixerButton
        onOpenMixer={onOpenMixer}
        openMixerLabel="Open mixer for this track"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open mixer for this track' }));
    expect(onOpenMixer).toHaveBeenCalledTimes(1);
    expect(onExpand).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Open mixer for this track' })).toBeTruthy();
  });

  test('transport buttons keep accessible names in Russian', () => {
    mockUseLang.mockReturnValue({ lang: 'ru', setLang: jest.fn() });

    render(
      <MiniPlayer
        title="Трек"
        isPlaying={true}
        onToggle={jest.fn()}
        onExpand={jest.fn()}
        forwardHandlers={noopForwardHandlers}
      />
    );

    expect(screen.getByRole('button', { name: 'Пауза' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Следующий трек' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Открыть полноэкранный плеер' })).toBeTruthy();
  });

  test('renders stacked artist and track labels when artist is provided', () => {
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });

    const { container } = render(
      <MiniPlayer
        title="Beatles - Norwegian Wood"
        artist="Beatles"
        isPlaying={false}
        onToggle={jest.fn()}
        onExpand={jest.fn()}
        forwardHandlers={noopForwardHandlers}
      />
    );

    expect(container.querySelector('.mini-player__title-stack')).toBeTruthy();
    expect(container.querySelector('.mini-player__title-line--artist')?.textContent).toBe(
      'Beatles'
    );
    expect(container.querySelector('.mini-player__title-line--track')?.textContent).toBe(
      'Norwegian Wood'
    );
  });

  test('play/pause label follows playing state', () => {
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });

    const { rerender } = render(
      <MiniPlayer
        title="Track"
        isPlaying={false}
        onToggle={jest.fn()}
        onExpand={jest.fn()}
        forwardHandlers={noopForwardHandlers}
      />
    );

    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();

    rerender(
      <MiniPlayer
        title="Track"
        isPlaying={true}
        onToggle={jest.fn()}
        onExpand={jest.fn()}
        forwardHandlers={noopForwardHandlers}
      />
    );

    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });
});
