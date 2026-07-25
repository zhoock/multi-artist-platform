// src/widgets/header/ui/Header.tsx
import { memo, useEffect, useState, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { Navigation } from '@features/navigation';
import { clearPremiumCheckoutAuthIntent } from '@shared/lib/authIntent';
import { appendReturnTo } from '@shared/lib/authReturnUrl';
import { shouldLeaveDeletedArtistPage } from '@shared/lib/accountDeletedSession';
import { useLang } from '@app/providers/lang'; // берём из контекста
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { isAuthenticated } from '@shared/lib/auth';
import type { SupportedLang } from '@shared/model/lang';
import { Hamburger } from '@shared/ui/hamburger';
import { ProfileAvatarMenu } from './ProfileAvatarMenu';
import './style.scss';

const LANG_OPTIONS: SupportedLang[] = ['en', 'ru'];

type Theme = 'light' | 'dark';

type HeaderProps = {
  theme: Theme;
  onToggleTheme: () => void;
  /** Открыто ли мобильное меню (оверлей Navigation) — для активного состояния гамбургера */
  navMenuOpen?: boolean;
  /** Открыть/закрыть мобильное меню — если передан, кнопка рендерится в конце шапки справа от авторизации */
  onNavMenuToggle?: () => void;
};

const HeaderComponent = ({
  theme,
  onToggleTheme,
  navMenuOpen = false,
  onNavMenuToggle,
}: HeaderProps) => {
  const { lang, setLang } = useLang(); // язык из контекста
  const location = useLocation();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const isAuthed = isAuthenticated();
  const authParams = new URLSearchParams({ mode: 'login' });
  const leaveDeletedArtistPage = shouldLeaveDeletedArtistPage();
  if (!leaveDeletedArtistPage) {
    appendReturnTo(authParams, location);
  }
  const authBackgroundLocation = leaveDeletedArtistPage
    ? { pathname: '/', search: '', hash: '', state: null, key: 'default' }
    : location;
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  // Закрываем меню языка при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (langRef.current && !langRef.current.contains(t)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Смена языка: обновляем Redux; uiDictionary подгружается в Layout
  const changeLang = (newLang: SupportedLang) => {
    if (newLang !== lang) {
      setLang(newLang);
    }
    setLangOpen(false);
  };

  const openLang = useCallback(() => {
    setLangOpen((open) => !open);
  }, []);

  return (
    <header className="header">
      <div className="wrapper header__wrapper">
        <div className="header__start">
          <Link className="logo" to="/">
            Home
          </Link>

          <div className="lang-menu" ref={langRef}>
            <button
              className="lang-current"
              type="button"
              onClick={openLang}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              aria-label={`Выбрать язык. Текущий язык: ${lang === 'ru' ? 'Русский' : 'English'}`}
            >
              {lang.toUpperCase()}
            </button>
            <ul className={clsx('lang-list', { 'is-hidden': !langOpen })} role="listbox">
              {LANG_OPTIONS.map((l) => (
                <li key={l}>
                  <button
                    className={clsx('lang-option', { active: lang === l })}
                    onClick={() => changeLang(l)}
                    role="option"
                    aria-selected={lang === l}
                  >
                    {l.toUpperCase()}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="theme-toggler">
            <label className="theme-toggler__label">
              <input
                type="checkbox"
                className="theme-toggler__control"
                checked={theme === 'light'}
                onChange={onToggleTheme}
                aria-label={
                  theme === 'light' ? 'Переключить на тёмную тему' : 'Переключить на светлую тему'
                }
              />
              <div></div>
            </label>
          </div>
        </div>

        <div className="header__trailing">
          <Navigation />
          {isAuthed ? (
            <ProfileAvatarMenu
              closeWhenLangMenuOpen={langOpen}
              onOpenChange={(open) => {
                if (open) setLangOpen(false);
              }}
            />
          ) : (
            <Link
              className="header__sign-in"
              to={{ pathname: '/auth', search: `?${authParams.toString()}` }}
              state={{ backgroundLocation: authBackgroundLocation }}
              onClick={() => {
                clearPremiumCheckoutAuthIntent();
                setLangOpen(false);
              }}
            >
              {ui?.header?.signIn ?? 'Sign in'}
            </Link>
          )}
          {onNavMenuToggle ? (
            <Hamburger
              variant="inline"
              isActive={navMenuOpen}
              onToggle={onNavMenuToggle}
              behindDialogOverlap={navMenuOpen}
            />
          ) : null}
        </div>
      </div>
    </header>
  );
};

export const Header = memo(HeaderComponent);
