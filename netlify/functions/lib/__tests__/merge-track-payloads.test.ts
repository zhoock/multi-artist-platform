import { describe, expect, it } from '@jest/globals';

import type { TrackLyricsBundle } from '../../../../src/shared/lib/lyrics/types';
import { isTrackAwaitingPublishPlayability } from '../../../../src/shared/lib/tracks/trackPublishReadiness';
import { mergeTrackPayloads } from '../merge-track-payloads';

const emptyLyrics = (albumId: string, trackId: string, content = ''): TrackLyricsBundle => ({
  albumId,
  trackId,
  lang: 'en',
  content,
  syncedLines: null,
  state: content.trim() ? 'text-only' : 'empty',
  syncedAt: null,
});

const PLAYBACK_URL = 'https://cdn.example.test/users/u1/track.opus';

function track(
  id: string,
  lang: 'ru' | 'en',
  overrides: Partial<{
    src: string | undefined;
    processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
    content: string;
    visibility: 'public' | 'hidden';
  }> = {}
) {
  const albumId = 'album-1';
  return {
    id,
    title: `${lang} title`,
    order_index: 0,
    src: overrides.src,
    processingStatus: overrides.processingStatus ?? 'ready',
    visibility: overrides.visibility ?? 'public',
    stemsVisibility: 'public' as const,
    content: overrides.content,
    authorship: lang === 'ru' ? 'ru author' : 'en author',
    lyrics: emptyLyrics(albumId, id, overrides.content ?? ''),
  };
}

describe('mergeTrackPayloads playback metadata', () => {
  it('uses EN playback src when RU has ready but empty src', () => {
    const [merged] = mergeTrackPayloads([
      { lang: 'ru', tracks: [track('t1', 'ru', { src: undefined, processingStatus: 'ready' })] },
      {
        lang: 'en',
        tracks: [track('t1', 'en', { src: PLAYBACK_URL, processingStatus: 'ready' })],
      },
    ]);

    expect(merged.processingStatus).toBe('ready');
    expect(merged.src).toBe(PLAYBACK_URL);
    expect(merged.visibility).toBe('public');
    expect(merged.title).toBe('ru title');
    expect(merged.translations?.en?.title).toBe('en title');
  });

  it('keeps RU playback when RU already has valid src', () => {
    const ruUrl = 'https://cdn.example.test/ru.opus';
    const enUrl = 'https://cdn.example.test/en.opus';
    const [merged] = mergeTrackPayloads([
      { lang: 'ru', tracks: [track('t1', 'ru', { src: ruUrl })] },
      { lang: 'en', tracks: [track('t1', 'en', { src: enUrl })] },
    ]);

    expect(merged.src).toBe(ruUrl);
    expect(merged.title).toBe('ru title');
  });

  it('preserves locale-primary row when no locale has playback src', () => {
    const [merged] = mergeTrackPayloads([
      {
        lang: 'ru',
        tracks: [track('t1', 'ru', { src: '', processingStatus: 'pending' })],
      },
      {
        lang: 'en',
        tracks: [track('t1', 'en', { src: undefined, processingStatus: 'processing' })],
      },
    ]);

    expect(merged.src).toBe('');
    expect(merged.processingStatus).toBe('pending');
    expect(merged.title).toBe('ru title');
  });

  it('does not show false Processing badge after merge when EN supplies src', () => {
    const [merged] = mergeTrackPayloads([
      { lang: 'ru', tracks: [track('t1', 'ru', { src: undefined, processingStatus: 'ready' })] },
      { lang: 'en', tracks: [track('t1', 'en', { src: PLAYBACK_URL, processingStatus: 'ready' })] },
    ]);

    expect(
      isTrackAwaitingPublishPlayability(
        {
          trackId: 't1',
          processingStatus: merged.processingStatus,
          src: merged.src,
          visibility: merged.visibility,
          stemsVisibility: merged.stemsVisibility,
        },
        true,
        'client'
      )
    ).toBe(false);
  });

  it('merges lyrics content without losing ru-first canon', () => {
    const [merged] = mergeTrackPayloads([
      {
        lang: 'ru',
        tracks: [track('t1', 'ru', { src: undefined, content: 'ru lyrics' })],
      },
      {
        lang: 'en',
        tracks: [track('t1', 'en', { src: PLAYBACK_URL, content: 'en lyrics' })],
      },
    ]);

    expect(merged.content).toBeTruthy();
    expect(merged.src).toBe(PLAYBACK_URL);
  });
});
