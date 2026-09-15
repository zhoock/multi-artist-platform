import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@/components/view/loadUniverse3DModule', () => ({
  loadUniverse3DModule: jest.fn(() =>
    Promise.resolve({
      Universe3D: class Universe3D {
        destroy() {}
        setSearchHighlight() {}
        navigateToArtistFromSearch() {}
        focusOnArtist() {}
      },
    })
  ),
}));

jest.mock('@/components/view/Universe3D', () => ({
  Universe3D: class Universe3D {
    destroy() {}
  },
  UNIVERSE_FOCUS_ARTIST_STORAGE_KEY: 'universe-focus-artist',
}));

import { fireEvent, screen } from '@testing-library/react';
import { HomePage } from '../HomePage';
import { renderWithProviders } from '@shared/lib/test-utils';

const HOME_USE_MOCKS_STORAGE_KEY = 'homeUseMocks';

function pressMocksShortcut(
  target: Document | Element | Window = window,
  extra: KeyboardEventInit = {}
) {
  fireEvent.keyDown(target, {
    key: 'M',
    code: 'KeyM',
    ctrlKey: true,
    shiftKey: true,
    ...extra,
  });
}

describe('HomePage mocks shortcut', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    sessionStorage.removeItem(HOME_USE_MOCKS_STORAGE_KEY);
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    sessionStorage.removeItem(HOME_USE_MOCKS_STORAGE_KEY);
  });

  test('does not render a visible Mocks toggle', () => {
    renderWithProviders(<HomePage />);

    expect(screen.queryByText(/Mocks:\s*(ON|OFF)/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mocks/i })).not.toBeInTheDocument();
  });

  test('Ctrl/Cmd+Shift+M toggles mocks and a second press restores the previous state', () => {
    renderWithProviders(<HomePage />);
    expect(sessionStorage.getItem(HOME_USE_MOCKS_STORAGE_KEY)).toBeNull();

    pressMocksShortcut();
    expect(sessionStorage.getItem(HOME_USE_MOCKS_STORAGE_KEY)).toBe('1');

    pressMocksShortcut(window, { metaKey: true, ctrlKey: false });
    expect(sessionStorage.getItem(HOME_USE_MOCKS_STORAGE_KEY)).toBe('0');
  });

  test('does not toggle mocks while typing in input, textarea, or contenteditable', () => {
    renderWithProviders(<HomePage />);

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const typingTargets: HTMLElement[] = [
      document.createElement('input'),
      document.createElement('textarea'),
      editable,
    ];

    for (const target of typingTargets) {
      sessionStorage.removeItem(HOME_USE_MOCKS_STORAGE_KEY);
      document.body.appendChild(target);
      target.focus();
      pressMocksShortcut(target);
      expect(sessionStorage.getItem(HOME_USE_MOCKS_STORAGE_KEY)).toBeNull();
      target.remove();
    }
  });

  test('does not register the shortcut in production', () => {
    process.env.NODE_ENV = 'production';
    renderWithProviders(<HomePage />);

    pressMocksShortcut();
    expect(sessionStorage.getItem(HOME_USE_MOCKS_STORAGE_KEY)).toBeNull();
  });
});
