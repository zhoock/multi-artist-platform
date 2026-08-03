import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type HelpArticleListItemProps = {
  to: string;
  title: string;
  description?: string;
};

export function HelpArticleListItem({ to, title, description }: HelpArticleListItemProps) {
  return (
    <li className="help-center__article-row">
      <Link to={to} className="help-center__article-row-link">
        <span className="help-center__article-row-content">
          <span className="help-center__article-row-title">{title}</span>
          {description ? (
            <span className="help-center__article-row-description">{description}</span>
          ) : null}
        </span>
        <ChevronRight
          {...dashboardActionIconProps({
            size: 20,
            className: 'help-center__article-row-chevron',
          })}
        />
      </Link>
    </li>
  );
}
