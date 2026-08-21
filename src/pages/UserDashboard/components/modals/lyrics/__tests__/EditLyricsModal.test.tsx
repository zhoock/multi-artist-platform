/** @jest-environment jsdom */

import React from 'react';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EditLyricsModal } from '../EditLyricsModal';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      uiDictionary: {
        entries: [{ dashboard: { cancel: 'Cancel', save: 'Save', editLyrics: 'Edit Lyrics' } }],
      },
    }),
}));

jest.mock('@shared/model/uiDictionary', () => ({
  selectUiDictionaryFirst: (state: { uiDictionary: { entries: Array<{ dashboard?: object }> } }) =>
    state.uiDictionary.entries[0],
}));

jest.mock('@shared/lib/hooks/useDashboardSaveLock', () => ({
  useDashboardSaveLock: () => ({
    isSaving: false,
    withSaving: async (action: () => Promise<void>) => action(),
  }),
}));

describe('EditLyricsModal cancel semantics', () => {
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

  test('Cancel discards draft edits and closes without saving', async () => {
    const onSave = jest.fn<(lyrics: string, authorship?: string) => Promise<void>>();
    const onClose = jest.fn();

    render(
      <EditLyricsModal
        isOpen
        initialLyrics="Saved lyrics"
        initialAuthorship="Saved author"
        onSave={onSave}
        onClose={onClose}
      />
    );

    const [textarea] = screen.getAllByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Draft lyrics');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Save persists draft and closes', async () => {
    const onSave = jest.fn(async () => undefined);
    const onClose = jest.fn();

    render(
      <EditLyricsModal isOpen initialLyrics="Saved lyrics" onSave={onSave} onClose={onClose} />
    );

    const [textarea] = screen.getAllByRole('textbox');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Draft lyrics');

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(onSave).toHaveBeenCalledWith('Draft lyrics', undefined);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
