/** @jest-environment jsdom */

import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SyncLyricsModal } from '../SyncLyricsModal';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      trackLyrics: { bundles: {} },
      uiDictionary: {
        entries: [
          {
            dashboard: {
              cancel: 'Cancel',
              save: 'Save',
              syncLyricsTitle: 'Sync lyrics',
              close: 'Close',
            },
          },
        ],
      },
    }),
}));

jest.mock('@shared/model/uiDictionary', () => ({
  selectUiDictionaryFirst: (state: { uiDictionary: { entries: Array<{ dashboard?: object }> } }) =>
    state.uiDictionary.entries[0],
}));

jest.mock('@entities/lyrics', () => ({
  fetchTrackLyricsBundle: jest.fn(async () => ({
    albumId: 'album-1',
    trackId: 'track-1',
    lang: 'en',
    content: 'Line one',
    authorship: 'Author',
    syncedLines: [{ text: 'Line one', startTime: 1, endTime: 2 }],
    state: 'synced',
    syncedAt: null,
  })),
  resolveTrackLyricsBundle: jest.fn(() => ({
    state: 'synced',
    syncedLines: [{ text: 'Line one', startTime: 1, endTime: 2 }],
  })),
  saveTrackLyricsSyncApi: jest.fn(),
  deleteTrackLyricsSyncApi: jest.fn(),
}));

describe('SyncLyricsModal cancel semantics', () => {
  beforeEach(() => {
    jest.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function showModal(
      this: HTMLDialogElement
    ) {
      this.open = true;
    });
    jest.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function close(
      this: HTMLDialogElement
    ) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    });
  });

  test('Cancel closes without calling save callback', async () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    render(
      <SyncLyricsModal
        isOpen
        albumId="album-1"
        trackId="track-1"
        trackTitle="Track"
        initialLyricsText="Line one"
        onSave={onSave}
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Line one')).toBeTruthy();
    });

    const timeButtons = screen.getAllByRole('button');
    const startButton = timeButtons.find((button) => button.textContent?.includes('0:01'));
    expect(startButton).toBeTruthy();
    await userEvent.click(startButton!);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
