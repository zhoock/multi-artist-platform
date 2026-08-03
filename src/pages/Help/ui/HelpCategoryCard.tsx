import { Link } from 'react-router-dom';

import { resolveHelpCategoryIcon } from '@entities/help';
import type { HelpCategory } from '@entities/help/model/types';
import type { SupportedLang } from '@shared/model/lang';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { buildHelpCategoryPath } from '@shared/lib/seo/publicPagePaths';

type HelpCategoryCardProps = {
  category: HelpCategory;
  lang: SupportedLang;
};

export function HelpCategoryCard({ category, lang }: HelpCategoryCardProps) {
  const Icon = resolveHelpCategoryIcon(category.slug);

  return (
    <li className="help-center__category-card">
      <Link
        to={buildHelpCategoryPath(lang, category.slug)}
        className="help-center__category-card-link"
      >
        <span className="help-center__category-card-icon" aria-hidden="true">
          <Icon {...dashboardActionIconProps({ size: 22 })} />
        </span>
        <span className="help-center__category-card-body">
          <span className="help-center__category-card-title">{category.title}</span>
          {category.description ? (
            <span className="help-center__category-card-description">{category.description}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
