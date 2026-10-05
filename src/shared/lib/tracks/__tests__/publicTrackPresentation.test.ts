import { describe, expect, test } from '@jest/globals';
import {
  isMixerOnlyTrack,
  isPublicListedTrack,
  isPublicPlayableTrack,
} from '../publicTrackPresentation';

type Row = [
  label: string,
  vis: string,
  stems: string,
  status: string,
  playable: boolean,
  listed: boolean,
];

describe('publicTrackPresentation', () => {
  test.each<Row>([
    ['A public + ready', 'public', 'public', 'ready', true, true],
    ['B public + failed', 'public', 'public', 'failed', false, false],
    ['C public + pending', 'public', 'public', 'pending', false, false],
    ['D public + processing', 'public', 'public', 'processing', false, false],
    ['E hidden + stems visible', 'hidden', 'public', 'ready', false, true],
    ['E hidden + stems visible, failed audio', 'hidden', 'public', 'failed', false, true],
    ['F hidden + stems hidden', 'hidden', 'hidden', 'ready', false, false],
    ['subscribers_only + ready', 'subscribers_only', 'hidden', 'ready', true, true],
    ['subscribers_only + pending', 'subscribers_only', 'hidden', 'pending', false, false],
  ])('%s', (_l, vis, stems, status, playable, listed) => {
    expect(isPublicPlayableTrack(vis, status)).toBe(playable);
    expect(isPublicListedTrack(vis, stems, status)).toBe(listed);
  });

  test('missing status (pre-pipeline row) counts as ready', () => {
    expect(isPublicPlayableTrack('public', null)).toBe(true);
    expect(isPublicPlayableTrack('public', undefined)).toBe(true);
  });

  test('a public track with visible stems but pending audio is not mixer-only', () => {
    expect(isMixerOnlyTrack('public', 'public')).toBe(false);
    expect(isPublicListedTrack('public', 'public', 'pending')).toBe(false);
  });
});
