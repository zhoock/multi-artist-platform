/** @jest-environment jsdom */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { TrackData } from '@entities/album/lib/transformEditableAlbumData';
import { SortableTrackItem } from '../SortableTrackItem';

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: { 'data-testid': 'sortable-attributes' },
    listeners: { onPointerDown: jest.fn() },
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

jest.mock('@shared/lib/payment/ArtistMonetizationContext', () => ({
  useArtistMonetization: () => ({ monetizationEnabled: false }),
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en', setLang: jest.fn() }),
}));

jest.mock('../TrackLyricsPanel', () => ({
  TrackLyricsPanel: () => null,
}));

const emptyLyrics = (albumId: string, trackId: string) => ({
  albumId,
  trackId,
  lang: 'en',
  content: '',
  syncedLines: null,
  state: 'empty' as const,
  syncedAt: null,
});

const sampleTrack: TrackData = {
  id: 'track-uuid-1',
  title: 'My Track',
  order_index: 0,
  duration: '3:30',
  lyrics: emptyLyrics('album-1', 'track-uuid-1'),
  visibility: 'public',
};

function renderTrack(overrides: Partial<ComponentProps<typeof SortableTrackItem>> = {}) {
  const onToggle = jest.fn();
  const onDelete = jest.fn();
  const onVisibilityChange = jest.fn(async () => undefined);

  const view = render(
    <SortableTrackItem
      track={sampleTrack}
      displayIndex={1}
      albumId="album-1"
      lyricsAlbumId="album-1"
      isOpen={false}
      onToggle={onToggle}
      onDelete={onDelete}
      onVisibilityChange={onVisibilityChange}
      onLyricsAction={jest.fn()}
      {...overrides}
    />
  );

  return { ...view, onToggle, onDelete, onVisibilityChange };
}

describe('SortableTrackItem accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not use role=button on the track row header container', () => {
    const { container } = renderTrack();

    const header = container.querySelector('.user-dashboard__expanded-track-header');
    expect(header).toBeTruthy();
    expect(header).not.toHaveAttribute('role', 'button');
    expect(header).not.toHaveAttribute('tabindex');
  });

  it('exposes a dedicated expand control with keyboard activation', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderTrack();

    const expand = screen.getByRole('button', { name: 'Expand track My Track' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');

    await user.click(expand);
    expect(onToggle).toHaveBeenCalledTimes(1);

    expand.focus();
    await user.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('keeps drag, access, and icon actions as separate button controls', () => {
    renderTrack({ onReplaceTrackAudio: jest.fn() });

    expect(screen.getByRole('button', { name: /drag to reorder/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /track access/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit track/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete track/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replace audio/i })).toBeInTheDocument();

    const dragHandle = screen.getByRole('button', { name: /drag to reorder/i });
    const header = dragHandle.closest('.user-dashboard__expanded-track-header');
    expect(header).toBeTruthy();
    expect(header).not.toHaveAttribute('role', 'button');
    expect(dragHandle.tagName).toBe('BUTTON');
  });

  it('preserves expand/collapse via expand control and header click on title area', async () => {
    const user = userEvent.setup();
    const { onToggle, container } = renderTrack();

    await user.click(screen.getByRole('button', { name: 'Expand track My Track' }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    const title = container.querySelector('.user-dashboard__expanded-track-title');
    expect(title).toBeTruthy();
    await user.click(title!);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('reflects expanded state on the expand control', () => {
    renderTrack({ isOpen: true });

    expect(screen.getByRole('button', { name: 'Collapse track My Track' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
});
