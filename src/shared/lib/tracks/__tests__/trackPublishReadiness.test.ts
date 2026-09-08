import { describe, expect, test } from '@jest/globals';

import {
  evaluateAlbumTracksPublishReadiness,
  getAlbumTracksPublishBlockKind,
  isCatalogVisibleTrack,
  isTrackPlayableForPublish,
} from '../trackPublishReadiness';
import type { TrackAssetRecord } from '../../audio/assetResolver';

const readyStreamAsset: TrackAssetRecord = {
  type: 'stream',
  format: 'opus',
  variant: '128k',
  status: 'ready',
  path: 'users/u1/audio/album/derived/stream/opus_128k/t1.opus',
};

const failedWaveformAsset: TrackAssetRecord = {
  type: 'waveform',
  format: 'json',
  variant: 'default',
  status: 'failed',
  path: null,
};

const baseVisibleTrack = {
  trackId: 't1',
  visibility: 'public' as const,
  stemsVisibility: 'public' as const,
};

function assetsMap(trackId: string, assets: TrackAssetRecord[]): Map<string, TrackAssetRecord[]> {
  return new Map([[trackId, assets]]);
}

describe('trackPublishReadiness', () => {
  test('catalog visibility matches public catalog rules', () => {
    expect(isCatalogVisibleTrack('public', 'public')).toBe(true);
    expect(isCatalogVisibleTrack('hidden', 'public')).toBe(true);
    expect(isCatalogVisibleTrack('hidden', 'hidden')).toBe(false);
  });

  test('pending track blocks publish (pipeline)', () => {
    expect(
      isTrackPlayableForPublish(
        { ...baseVisibleTrack, processingStatus: 'pending', src: '' },
        [],
        true
      )
    ).toBe(false);
  });

  test('processing track blocks publish (pipeline)', () => {
    expect(
      isTrackPlayableForPublish(
        { ...baseVisibleTrack, processingStatus: 'processing', src: '' },
        [],
        true
      )
    ).toBe(false);
  });

  test('failed track blocks publish (pipeline)', () => {
    expect(
      isTrackPlayableForPublish(
        { ...baseVisibleTrack, processingStatus: 'failed', src: '' },
        [],
        true
      )
    ).toBe(false);
  });

  test('ready track with ready playback asset allows publish', () => {
    expect(
      isTrackPlayableForPublish(
        { ...baseVisibleTrack, processingStatus: 'ready', src: '' },
        [readyStreamAsset],
        true
      )
    ).toBe(true);
  });

  test('ready track without playback asset blocks publish', () => {
    expect(
      isTrackPlayableForPublish(
        { ...baseVisibleTrack, processingStatus: 'ready', src: '' },
        [],
        true
      )
    ).toBe(false);
  });

  test('optional asset missing does not block publish when playback asset ready', () => {
    const evaluation = evaluateAlbumTracksPublishReadiness(
      [{ ...baseVisibleTrack, processingStatus: 'ready', src: '' }],
      assetsMap('t1', [readyStreamAsset, failedWaveformAsset]),
      true
    );
    expect(evaluation.ready).toBe(true);
  });

  test('mixed album with one ready and one pending visible track blocks publish', () => {
    const evaluation = evaluateAlbumTracksPublishReadiness(
      [
        { ...baseVisibleTrack, trackId: 'ready', processingStatus: 'ready', src: '' },
        {
          ...baseVisibleTrack,
          trackId: 'pending',
          processingStatus: 'pending',
          src: '',
        },
      ],
      new Map([
        ['ready', [readyStreamAsset]],
        ['pending', []],
      ]),
      true
    );
    expect(evaluation.ready).toBe(false);
    expect(evaluation.unplayableVisibleTrackCount).toBe(1);
  });

  test('hidden failed track does not block publish when visible track is ready', () => {
    const evaluation = evaluateAlbumTracksPublishReadiness(
      [
        { ...baseVisibleTrack, trackId: 'visible', processingStatus: 'ready', src: '' },
        {
          trackId: 'hidden-failed',
          visibility: 'hidden',
          stemsVisibility: 'hidden',
          processingStatus: 'failed',
          src: '',
        },
      ],
      assetsMap('visible', [readyStreamAsset]),
      true
    );
    expect(evaluation.ready).toBe(true);
    expect(evaluation.visibleTrackCount).toBe(1);
  });

  test('only hidden tracks does not make album publish-ready', () => {
    const evaluation = evaluateAlbumTracksPublishReadiness(
      [
        {
          trackId: 'hidden-only',
          visibility: 'hidden',
          stemsVisibility: 'hidden',
          processingStatus: 'ready',
          src: '',
        },
      ],
      assetsMap('hidden-only', [readyStreamAsset]),
      true
    );
    expect(evaluation.ready).toBe(false);
    expect(evaluation.visibleTrackCount).toBe(0);
  });

  test('legacy track with src and no pipeline is playable', () => {
    expect(
      isTrackPlayableForPublish(
        { ...baseVisibleTrack, src: 'users/u1/track.mp3' },
        undefined,
        false
      )
    ).toBe(true);
  });

  test('block kind prefers failed over processing', () => {
    const kind = getAlbumTracksPublishBlockKind(
      [
        { ...baseVisibleTrack, trackId: 'failed', processingStatus: 'failed', src: '' },
        { ...baseVisibleTrack, trackId: 'pending', processingStatus: 'pending', src: '' },
      ],
      new Map([
        ['failed', []],
        ['pending', []],
      ]),
      true
    );
    expect(kind).toBe('processingFailed');
  });
});
