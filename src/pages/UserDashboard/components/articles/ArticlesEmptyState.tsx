import { FileText as FileTextIcon, Upload as UploadIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { DashboardEmptyState, DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

type ArticlesEmptyStateProps = {
  ui: IInterface | null | undefined;
  onCreateArticle: () => void;
};

const ARTICLES_EMPTY_ICON_SIZE = 108;

export function ArticlesEmptyState({ ui, onCreateArticle }: ArticlesEmptyStateProps) {
  const d = ui?.dashboard;

  return (
    <DashboardEmptyState
      variant="tab"
      icon={<FileTextIcon {...dashboardActionIconProps({ size: ARTICLES_EMPTY_ICON_SIZE })} />}
      title={d?.articlesEmptyTitle ?? "You don't have any articles yet"}
      description={d?.articlesEmptyDescription ?? 'Publish your first article.'}
      action={
        <DashboardButton variant="primary" onClick={onCreateArticle}>
          <UploadIcon {...dashboardActionIconProps({ size: 18 })} />
          <span>{d?.createArticle ?? 'Create article'}</span>
        </DashboardButton>
      }
    />
  );
}
