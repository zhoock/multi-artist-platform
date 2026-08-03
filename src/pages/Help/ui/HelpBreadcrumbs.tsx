import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectHelpCategoryBySlug } from '@entities/help';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { buildHelpCategoryPath, buildHelpHomePath } from '@shared/lib/seo/publicPagePaths';

type HelpBreadcrumbsProps = {
  categorySlug?: string;
  articleTitle?: string;
};

export function HelpBreadcrumbs({ categorySlug, articleTitle }: HelpBreadcrumbsProps) {
  const { lang } = useLang();
  const category = useAppSelector((state) =>
    categorySlug ? selectHelpCategoryBySlug(state, lang, categorySlug) : null
  );

  const homeLabel = lang === 'en' ? 'Help center' : 'Справочный центр';

  return (
    <nav
      className="help-center__breadcrumbs"
      aria-label={lang === 'en' ? 'Breadcrumb' : 'Навигация'}
    >
      <ol className="help-center__breadcrumbs-list">
        <li className="help-center__breadcrumbs-item">
          {categorySlug || articleTitle ? (
            <Link to={buildHelpHomePath(lang)} className="help-center__breadcrumbs-link">
              {homeLabel}
            </Link>
          ) : (
            <span className="help-center__breadcrumbs-current" aria-current="page">
              {homeLabel}
            </span>
          )}
        </li>

        {category ? (
          <li className="help-center__breadcrumbs-item">
            <ChevronRight
              {...dashboardActionIconProps({
                size: 14,
                className: 'help-center__breadcrumbs-separator',
              })}
            />
            {articleTitle ? (
              <Link
                to={buildHelpCategoryPath(lang, category.slug)}
                className="help-center__breadcrumbs-link"
              >
                {category.title}
              </Link>
            ) : (
              <span className="help-center__breadcrumbs-current" aria-current="page">
                {category.title}
              </span>
            )}
          </li>
        ) : null}

        {articleTitle ? (
          <li className="help-center__breadcrumbs-item">
            <ChevronRight
              {...dashboardActionIconProps({
                size: 14,
                className: 'help-center__breadcrumbs-separator',
              })}
            />
            <span className="help-center__breadcrumbs-current" aria-current="page">
              {articleTitle}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
