import { describe, expect, test, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MixerAlbumList } from '../MixerAlbumList';
import type { MixerAlbum } from '../../lib/types';

const trackCountLabels = {
  one: '{count} track',
  few: '{count} tracks',
  many: '{count} tracks',
};

const albums: MixerAlbum[] = [
  {
    albumId: 'a1',
    title: 'Album One',
    year: '2022',
    tracks: [
      { id: 't1', title: 'Track 1', duration: 120, stems: [] },
      { id: 't2', title: 'Track 2', duration: 90, stems: [] },
    ],
  },
  {
    albumId: 'a2',
    title: 'Album Two',
    year: '2025',
    tracks: [{ id: 't3', title: 'Track 3', duration: 60, stems: [] }],
  },
];

function renderList(overrides: Partial<Parameters<typeof MixerAlbumList>[0]> = {}) {
  return render(
    <MixerAlbumList
      albums={albums}
      loading={false}
      lang="en"
      trackCountLabels={trackCountLabels}
      emptyLabel="No albums with stems yet"
      loadingLabel="Loading…"
      onSelectAlbum={jest.fn()}
      {...overrides}
    />
  );
}

describe('MixerAlbumList', () => {
  test('renders one card per album with title, year and track count', () => {
    renderList();

    expect(screen.getByText('Album One')).toBeInTheDocument();
    expect(screen.getByText('Album Two')).toBeInTheDocument();
    expect(screen.getByText('2 tracks')).toBeInTheDocument();
    expect(screen.getByText('1 track')).toBeInTheDocument();
  });

  test('shows the loading hint while loading', () => {
    renderList({ loading: true });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Album One')).not.toBeInTheDocument();
  });

  test('shows the empty hint when there are no albums', () => {
    renderList({ albums: [] });
    expect(screen.getByText('No albums with stems yet')).toBeInTheDocument();
  });
});
