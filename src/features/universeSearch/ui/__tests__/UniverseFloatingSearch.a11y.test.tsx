/** @jest-environment jsdom */

import { describe, expect, jest, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UniverseFloatingSearch } from '../UniverseFloatingSearch';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      uiDictionary: {
        entries: [
          {
            search: {
              artistsPlaceholder: 'Search artists...',
              clearSearch: 'Clear search',
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

const artists = [
  {
    publicSlug: 'beatles',
    name: 'Beatles',
    genreCode: 'rock',
    headerImages: [],
  },
];

describe('UniverseFloatingSearch combobox semantics', () => {
  test('search input uses combobox role with aria-expanded when results are shown', async () => {
    const user = userEvent.setup();
    render(
      <UniverseFloatingSearch
        artists={artists}
        onSearchMatchesChange={jest.fn()}
        onNavigateToArtist={jest.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Search' }));

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveAttribute('aria-autocomplete', 'list');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');

    await user.type(combobox, 'beat');
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    expect(combobox).toHaveAttribute('aria-controls');
  });
});
