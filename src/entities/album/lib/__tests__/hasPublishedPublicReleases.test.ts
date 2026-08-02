import { describe, expect, test } from '@jest/globals';
import { hasPublishedPublicReleases } from '../hasPublishedPublicReleases';
import type { AlbumEditable, TracksProps } from '@models';

const mockTrack: TracksProps = {
  id: '1',
  title: 'Track',
  content: '',
  duration: 180,
  src: 'track.mp3',
  order_index: 10,
};

describe('hasPublishedPublicReleases', () => {
  test('returns true only for public releases with at least one track', () => {
    const album: AlbumEditable = {
      album: 'My Release',
      artistDisplayName: 'Band',
      fullName: 'Band — My Release',
      description: '',
      release: { date: '2024-01-01' },
      tracks: [mockTrack],
      buttons: {},
      details: [],
      isPublic: true,
      isPublished: true,
    };
    expect(hasPublishedPublicReleases([album])).toBe(true);
  });

  test('ignores published but hidden albums', () => {
    expect(
      hasPublishedPublicReleases([
        {
          album: 'Hidden Release',
          artistDisplayName: 'Band',
          fullName: 'Band — Hidden Release',
          description: '',
          release: { date: '2024-01-01' },
          tracks: [mockTrack],
          buttons: {},
          details: [],
          isPublic: false,
          isPublished: true,
        },
      ])
    ).toBe(false);
  });

  test('ignores private, untitled, or trackless albums', () => {
    expect(
      hasPublishedPublicReleases([
        {
          album: 'Draft',
          artistDisplayName: 'Band',
          fullName: 'Band — Draft',
          description: '',
          release: { date: '2024-01-01' },
          tracks: [mockTrack],
          buttons: {},
          details: [],
          isPublic: false,
        },
        {
          album: '   ',
          artistDisplayName: 'Band',
          fullName: 'Band',
          description: '',
          release: { date: '2024-01-01' },
          tracks: [mockTrack],
          buttons: {},
          details: [],
          isPublic: true,
        },
        {
          album: 'Empty Release',
          artistDisplayName: 'Band',
          fullName: 'Band — Empty Release',
          description: '',
          release: { date: '2024-01-01' },
          tracks: [],
          buttons: {},
          details: [],
          isPublic: true,
        },
      ])
    ).toBe(false);
  });
});
