/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

import { PreviewLyricsModal } from '../PreviewLyricsModal';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      uiDictionary: {
        entries: [
          {
            dashboard: {
              previewLyrics: 'Preview Lyrics',
              close: 'Close',
            },
          },
        ],
      },
    }),
}));

jest.mock('@shared/model/uiDictionary', () => ({
  selectUiDictionaryFirst: (state: { uiDictionary: { entries: Array<object> } }) =>
    state.uiDictionary.entries[0],
}));

jest.mock('@shared/api/albums', () => ({
  getUserAudioUrl: () => 'blob:preview-lyrics-test',
}));

const lyrics: TrackLyricsBundle = {
  albumId: 'album-1',
  trackId: 'track-1',
  lang: 'en',
  content: 'Line one',
  authorship: '',
  syncedLines: [{ text: 'Line one', startTime: 0, endTime: 2 }],
  state: 'synced',
  syncedAt: null,
};

class MockAudio {
  #currentTime = 0;
  duration = 120;
  preload = '';
  src = '';

  get currentTime() {
    return this.#currentTime;
  }

  set currentTime(value: number) {
    this.#currentTime = value;
  }

  addEventListener(event: string, handler: () => void) {
    if (event === 'loadedmetadata') {
      queueMicrotask(() => handler());
    }
  }

  removeEventListener() {}

  pause() {}

  play() {
    return Promise.resolve(undefined);
  }
}

describe('PreviewLyricsModal seek accessibility', () => {
  beforeEach(() => {
    // @ts-expect-error test double for jsdom
    global.Audio = MockAudio;
    Element.prototype.scrollIntoView = jest.fn();

    jest.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function showModal(
      this: HTMLDialogElement
    ) {
      this.open = true;
    });
    jest.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function close(
      this: HTMLDialogElement
    ) {
      this.open = false;
    });
  });

  test('exposes seek slider with accessible name and supports value changes', async () => {
    render(
      <PreviewLyricsModal
        isOpen
        lyrics={lyrics}
        trackSrc="track.mp3"
        mediaOwnerUserId="user-1"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('slider', { name: 'Track position' })).toBeTruthy();
    });

    const slider = screen.getByRole('slider', { name: 'Track position' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '12.5' } });
    expect(slider.value).toBe('12.5');
  });
});
