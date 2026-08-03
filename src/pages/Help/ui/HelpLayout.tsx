import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { fetchHelpCatalog, selectHelpCatalogStatus } from '@entities/help';
import { isHelpLoaderPath } from '@entities/help/lib/helpRouteMatch';
import { stripLangPrefix } from '@shared/lib/i18n/routeLang';
import { HelpCenterSearch } from './HelpCenterSearch';
import { HelpSearchResults } from './HelpSearchResults';

import './style.scss';

export function HelpLayout() {
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const location = useLocation();

  const catalogStatus = useAppSelector((state) => selectHelpCatalogStatus(state, lang));
  const [searchQuery, setSearchQuery] = useState('');

  const trimmedSearchQuery = searchQuery.trim();
  const hasSearchQuery = trimmedSearchQuery.length > 0;
  useEffect(() => {
    if (catalogStatus === 'idle') {
      dispatch(fetchHelpCatalog({ lang }));
    }
  }, [catalogStatus, dispatch, lang]);

  useEffect(() => {
    setSearchQuery('');
  }, [location.pathname]);

  const isHomePage = stripLangPrefix(location.pathname) === '/help';

  return (
    <section className="help-center main-background" aria-label="Help center">
      <div className="wrapper help-center__wrapper">
        <HelpCenterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          className={isHomePage ? 'help-center-search--home' : undefined}
        />

        <div className="help-center__main">
          {hasSearchQuery ? <HelpSearchResults query={trimmedSearchQuery} /> : <Outlet />}
        </div>
      </div>
    </section>
  );
}

/** @deprecated Help pages use direct markup — kept for transitional imports. */
export function HelpPageShell({
  title,
  description,
  children,
  showHeader = true,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  showHeader?: boolean;
}) {
  return (
    <>
      {showHeader && title ? <h1 className="help-center__title">{title}</h1> : null}
      {showHeader && description ? <p className="help-center__lead">{description}</p> : null}
      {children}
    </>
  );
}

export function isHelpRoutePathname(pathname: string): boolean {
  return isHelpLoaderPath(pathname);
}
