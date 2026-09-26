/** @jest-environment jsdom */

import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

import type { TrackData } from '@entities/album/lib/transformEditableAlbumData';

import { SortableTrackItem } from '../SortableTrackItem';

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: { 'aria-roledescription': 'sortable' },
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/payment/ArtistMonetizationContext', () => ({
  useArtistMonetization: () => ({ monetizationEnabled: true }),
}));

jest.mock('../../../lib/useDashboardAccessMenu', () => ({
  useDashboardAccessMenu: () => ({
    triggerRef: { current: null },
    menuRef: { current: null },
    menuOpen: false,
    menuStyle: {},
    portalMount: null,
    toggleMenu: jest.fn(),
    closeMenu: jest.fn(),
  }),
  DashboardAccessMenuPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  resolveDashboardAccessMenuPortalFromElement: () => null,
}));

jest.mock('../TrackLyricsPanel', () => ({
  TrackLyricsPanel: () => null,
}));

jest.mock('../TrackProcessingStatus', () => ({
  TrackProcessingStatus: () => null,
}));

const baseTrack: TrackData = {
  id: 'track-1',
  title: 'Opening',
  order_index: 0,
  duration: '3:00',
  lyrics: {
    albumId: 'album-1',
    trackId: 'track-1',
    lang: 'en',
    content: '',
    authorship: '',
    syncedLines: null,
    state: 'text-only',
    syncedAt: null,
  },
  visibility: 'public',
  src: 'audio.mp3',
  processingStatus: 'ready',
};

describe('SortableTrackItem accessibility', () => {
  test('drag handle is a native button and row header toggles with Enter', () => {
    const onToggle = jest.fn();

    const { container } = render(
      <SortableTrackItem
        track={baseTrack}
        displayIndex={1}
        albumId="album-1"
        lyricsAlbumId="album-1"
        isOpen={false}
        onToggle={onToggle}
        onDelete={jest.fn()}
        onVisibilityChange={jest.fn(async () => {})}
        onLyricsAction={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Drag to reorder' })).toBeTruthy();

    const rowToggle = container.querySelector('.user-dashboard__expanded-track-header');
    expect(rowToggle).toBeTruthy();
    fireEvent.keyDown(rowToggle!, { key: 'Enter' });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
