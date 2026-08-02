import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { Menu as MenuIcon, X as XIcon } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import {
  fetchHelpCatalog,
  selectHelpArticleSummaries,
  selectHelpCatalogStatus,
  selectHelpCategories,
} from '@entities/help';
import {
  buildHelpArticlePath,
  buildHelpCategoryPath,
  buildHelpHomePath,
} from '@shared/lib/seo/publicPagePaths';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import './style.scss';

const SIDEBAR_STORAGE_KEY = 'help-sidebar-open';

export function HelpLayout() {
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { categorySlug = '' } = useParams<{ categorySlug?: string }>();

  const catalogStatus = useAppSelector((state) => selectHelpCatalogStatus(state, lang));
  const categories = useAppSelector((state) => selectHelpCategories(state, lang));
  const articleSummaries = useAppSelector((state) => selectHelpArticleSummaries(state, lang));

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => readSidebarOpenPreference());

  useEffect(() => {
    if (catalogStatus === 'idle') {
      dispatch(fetchHelpCatalog({ lang }));
    }
  }, [catalogStatus, dispatch, lang]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarOpen));
  }, [isSidebarOpen]);

  const categoriesWithArticles = useMemo(
    () =>
      categories
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((category) => ({
          ...category,
          articles: articleSummaries
            .filter((article) => article.categorySlug === category.slug)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
        }))
        .filter((category) => category.articles.length > 0),
    [categories, articleSummaries]
  );

  return (
    <section className="help-center main-background" aria-label="Help center">
      <div
        className={`wrapper help-center__wrapper ${isSidebarOpen ? 'help-center__wrapper--sidebar-open' : 'help-center__wrapper--sidebar-closed'}`}
      >
        {isSidebarOpen ? (
          <div
            className="help-center__overlay"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
        ) : null}

        <button
          type="button"
          className="help-center__sidebar-toggle"
          onClick={() => setIsSidebarOpen((open) => !open)}
          aria-label={sidebarToggleLabel(lang, isSidebarOpen)}
          aria-expanded={isSidebarOpen}
        >
          {isSidebarOpen ? (
            <XIcon {...dashboardActionIconProps({ size: 20 })} />
          ) : (
            <MenuIcon {...dashboardActionIconProps({ size: 20 })} />
          )}
        </button>

        <aside
          className={`help-center__sidebar ${isSidebarOpen ? 'help-center__sidebar--open' : 'help-center__sidebar--closed'}`}
        >
          <nav
            className="help-center__nav"
            aria-label={lang === 'en' ? 'Help navigation' : 'Навигация справочника'}
          >
            <Link to={buildHelpHomePath(lang)} className="help-center__back-link">
              {lang === 'en' ? '« Help center' : '« Справочный центр'}
            </Link>

            {categoriesWithArticles.map((category) => (
              <div key={category.slug} className="help-center__category">
                <h2 className="help-center__category-title">
                  <Link
                    to={buildHelpCategoryPath(lang, category.slug)}
                    className={`help-center__category-link ${categorySlug === category.slug ? 'help-center__category-link--active' : ''}`}
                  >
                    {category.title}
                  </Link>
                </h2>
                <ul className="help-center__article-list">
                  {category.articles.map((article) => {
                    const articlePath = buildHelpArticlePath(lang, category.slug, article.slug);
                    const isActive = location.pathname === articlePath;
                    return (
                      <li key={article.slug} className="help-center__article-item">
                        <Link
                          to={articlePath}
                          className={`help-center__article-link ${isActive ? 'help-center__article-link--active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => {
                            if (window.innerWidth < 768) {
                              setIsSidebarOpen(false);
                            }
                          }}
                        >
                          {article.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="help-center__content">
          <Outlet />
        </div>
      </div>
    </section>
  );
}

function readSidebarOpenPreference(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (saved !== null) {
    return saved === 'true';
  }
  return window.innerWidth >= 768;
}

function sidebarToggleLabel(lang: string, isOpen: boolean): string {
  if (lang === 'en') {
    return isOpen ? 'Hide sidebar' : 'Show sidebar';
  }
  return isOpen ? 'Скрыть боковое меню' : 'Показать боковое меню';
}

export function HelpPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <>
      <h1 className="help-center__title">{title}</h1>
      {description ? <p className="help-center__lead">{description}</p> : null}
      {children}
    </>
  );
}
