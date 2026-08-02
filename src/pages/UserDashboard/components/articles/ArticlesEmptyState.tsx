import { FileText as FileTextIcon, Upload as UploadIcon } from 'lucide-react';

import type { IInterface } from '@models';
import { DashboardEmptyState } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { bindDashboardPreloadIntentHandlers } from '../../lib/bindDashboardPreloadIntentHandlers';

type ArticlesEmptyStateProps = {
  ui: IInterface | null | undefined;
  onCreateArticle: () => void;
  onPreloadCreateArticle?: () => void;
};

const ARTICLES_EMPTY_ICON_SIZE = 108;

export function ArticlesEmptyState({
  ui,
  onCreateArticle,
  onPreloadCreateArticle,
}: ArticlesEmptyStateProps) {
  const d = ui?.dashboard;
  const preloadHandlers = bindDashboardPreloadIntentHandlers(onPreloadCreateArticle);

  return (
    <DashboardEmptyState
      variant="tab"
      icon={<FileTextIcon {...dashboardActionIconProps({ size: ARTICLES_EMPTY_ICON_SIZE })} />}
      title={d?.articlesEmptyTitle ?? "You don't have any articles yet"}
      description={d?.articlesEmptyDescription ?? 'Publish your first article.'}
      primaryAction={{
        label: d?.createArticle ?? 'Create article',
        onClick: onCreateArticle,
        icon: <UploadIcon {...dashboardActionIconProps({ size: 18 })} />,
        buttonProps: preloadHandlers,
      }}
    />
  );
}
