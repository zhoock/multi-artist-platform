import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockDispatch = jest.fn();
const mockUseLang = jest.fn();

jest.mock('@shared/lib/hooks/useAppDispatch', () => ({
  useAppDispatch: () => mockDispatch,
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => mockUseLang(),
}));

jest.mock('@widgets/notFound', () => ({
  NotFoundPage: () => <div data-testid="not-found">404</div>,
}));

import { LangLayout } from '../LangLayout';

function HomeStub() {
  return <div data-testid="home">home</div>;
}

function renderLangRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/:lang" element={<LangLayout />}>
          <Route index element={<HomeStub />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('LangLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });
  });

  test('renders nested route for supported locale', () => {
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });
    renderLangRoute('/ru');
    expect(screen.getByTestId('home')).toBeTruthy();
    expect(screen.queryByTestId('not-found')).toBeNull();
  });

  test('syncs URL locale to Redux when current lang differs', () => {
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });
    renderLangRoute('/ru');
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'lang/setLang', payload: 'ru' })
    );
  });

  test('does not dispatch when Redux already matches URL', () => {
    mockUseLang.mockReturnValue({ lang: 'ru', setLang: jest.fn() });
    renderLangRoute('/ru');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('does not revert Redux when current lang changes without URL navigation', () => {
    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });
    const { rerender } = renderLangRoute('/ru');

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    mockDispatch.mockClear();

    mockUseLang.mockReturnValue({ lang: 'en', setLang: jest.fn() });
    rerender(
      <MemoryRouter initialEntries={['/ru']}>
        <Routes>
          <Route path="/:lang" element={<LangLayout />}>
            <Route index element={<HomeStub />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  test('shows 404 for unsupported locale segment', async () => {
    renderLangRoute('/de');
    expect(await screen.findByTestId('not-found')).toBeTruthy();
    expect(screen.queryByTestId('home')).toBeNull();
  });
});
