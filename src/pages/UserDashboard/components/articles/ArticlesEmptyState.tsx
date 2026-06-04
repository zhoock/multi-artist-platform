import { FileText as FileTextIcon, Upload as UploadIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type ArticlesEmptyStateProps = {
  ui: IInterface | null | undefined;
  onCreateArticle: () => void;
};

const ARTICLES_EMPTY_ICON_SIZE = 108;

export function ArticlesEmptyState({ ui, onCreateArticle }: ArticlesEmptyStateProps) {
  const d = ui?.dashboard;

  return (
    <div className="user-dashboard__tab-empty" role="status">
      <div className="user-dashboard__tab-empty-inner">
        <FileTextIcon
          className="user-dashboard__tab-empty-icon"
          {...dashboardActionIconProps({ size: ARTICLES_EMPTY_ICON_SIZE })}
        />
        <h3 className="user-dashboard__tab-empty-title">
          {d?.articlesEmptyTitle ?? "You don't have any articles yet"}
        </h3>
        <p className="user-dashboard__tab-empty-description">
          {d?.articlesEmptyDescription ?? 'Publish your first article.'}
        </p>
        <button type="button" className="user-dashboard__tab-empty-cta" onClick={onCreateArticle}>
          <UploadIcon {...dashboardActionIconProps({ size: 18 })} />
          <span>{d?.createArticle ?? 'Create article'}</span>
        </button>
      </div>
    </div>
  );
}
