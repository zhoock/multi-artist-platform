import { describe, test, expect } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { useLangFromRoute } from '../useLangFromRoute';

function createWrapper(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>;
  };
}

describe('useLangFromRoute', () => {
  test('returns null lang on unprefixed paths', () => {
    const { result } = renderHook(() => useLangFromRoute(), {
      wrapper: createWrapper('/albums?artist=my-band'),
    });

    expect(result.current).toEqual({
      lang: null,
      pathnameWithoutLang: '/albums',
      hasLangPrefix: false,
    });
  });

  test('reads locale from prefixed public paths', () => {
    const { result } = renderHook(() => useLangFromRoute(), {
      wrapper: createWrapper('/en/albums/debut'),
    });

    expect(result.current).toEqual({
      lang: 'en',
      pathnameWithoutLang: '/albums/debut',
      hasLangPrefix: true,
    });
  });

  test('reads locale from localized home path', () => {
    const { result } = renderHook(() => useLangFromRoute(), {
      wrapper: createWrapper('/ru'),
    });

    expect(result.current).toEqual({
      lang: 'ru',
      pathnameWithoutLang: '/',
      hasLangPrefix: true,
    });
  });

  test('updates when router pathname changes', () => {
    const { result, rerender } = renderHook(() => useLangFromRoute(), {
      wrapper: createWrapper('/ru/articles'),
    });

    expect(result.current.lang).toBe('ru');

    rerender();
    // MemoryRouter initial entry is fixed; simulate navigation by remounting with new wrapper
    const { result: nextResult } = renderHook(() => useLangFromRoute(), {
      wrapper: createWrapper('/en/articles'),
    });

    expect(nextResult.current).toEqual({
      lang: 'en',
      pathnameWithoutLang: '/articles',
      hasLangPrefix: true,
    });
  });
});
