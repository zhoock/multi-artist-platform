/// <reference types="@testing-library/jest-dom" />
import { describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '../ui/Header';
import { renderWithProviders } from '@shared/lib/test-utils';

describe('Header integration tests', () => {
  test('должен отобразить текущий язык', () => {
    renderWithProviders(<Header theme="dark" onToggleTheme={() => {}} />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    const langButton = screen.getByRole('button', { name: /en/i });
    expect(langButton).toBeInTheDocument();
  });

  test('должен открыть меню языков при клике', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Header theme="dark" onToggleTheme={() => {}} />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    const langButton = screen.getByRole('button', { name: /en/i });
    await user.click(langButton);

    const ruOption = screen.getByRole('option', { name: /ru/i });
    expect(ruOption).toBeInTheDocument();
  });

  test('должен переключить язык при выборе', async () => {
    const user = userEvent.setup();
    const { store } = renderWithProviders(<Header theme="dark" onToggleTheme={() => {}} />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    const langButton = screen.getByRole('button', { name: /en/i });
    await user.click(langButton);

    const ruOption = screen.getByRole('option', { name: /ru/i });
    await user.click(ruOption);

    const state = store.getState();
    expect(state.lang.current).toBe('ru');
  });

  test('не должен показывать переключатель темы, пока light theme отключена', () => {
    renderWithProviders(<Header theme="dark" onToggleTheme={() => {}} />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  test('должен отобразить ссылку на главную', () => {
    renderWithProviders(<Header theme="dark" onToggleTheme={() => {}} />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    const homeLink = screen.getByRole('link', { name: /home/i });
    expect(homeLink).toHaveAttribute('href', '/');
  });

  test('должен закрыть меню языков при клике вне его', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Header theme="dark" onToggleTheme={() => {}} />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    const langButton = screen.getByRole('button', { name: /en/i });
    await user.click(langButton);

    expect(screen.getByRole('option', { name: /ru/i })).toBeInTheDocument();

    // Кликаем вне меню (на wrapper)
    const wrapper = container.querySelector('.wrapper');
    if (wrapper) {
      await user.click(wrapper);
    }

    // Меню должно закрыться через обработчик mousedown
    const langList = container.querySelector('.lang-list');
    expect(langList).toHaveClass('is-hidden');
  });

  test('ссылка Sign in открывает auth в режиме login', () => {
    renderWithProviders(<Header theme="dark" onToggleTheme={() => {}} />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    const signInLink = screen.getByRole('link', { name: /sign in/i });
    expect(signInLink).toHaveAttribute('href', expect.stringContaining('mode=login'));
    expect(signInLink.getAttribute('href')).not.toContain('mode=register');
  });

  test('должен установить aria-expanded при открытии меню', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Header theme="dark" onToggleTheme={() => {}} />, {
      preloadedState: {
        lang: { current: 'en' },
      },
    });

    const langButton = screen.getByRole('button', { name: /en/i });
    expect(langButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(langButton);

    expect(langButton).toHaveAttribute('aria-expanded', 'true');
  });
});
